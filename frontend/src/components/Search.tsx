import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Search as Magnifier } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { ApiError, api } from "../lib/api";

/** How long typing has to pause before the search is sent (K3). */
export const PAUSE_MS = 150;
const SHOWN = 5;
const LONGEST = 100;

/** One result: every kind has an id and a name, and each area's results carry more, which its group shows. */
export type SearchResult = { id: number; name: string; [field: string]: unknown };

/**
 * One kind of record the box finds, as its area describes it. Methods rather than
 * arrow properties, so a group for a narrower result still fits in a list of groups.
 */
export type SearchGroup<Result extends SearchResult = SearchResult> = {
  /** Where the reply keeps this kind, which is also its section's address, such as "contacts". */
  kind: string;
  heading: string;
  address(id: number): string;
  /** The one detail shown in muted ink at the end of the row (K5). */
  detail(result: Result): ReactNode;
  /** A chip after the name, such as a deal's stage. */
  chip?(result: Result): ReactNode;
};

export type SearchResults = Record<string, { count: number; results: SearchResult[] }>;

/** A reply with the text it answers, which may be an earlier one than the box now holds. */
type Found = { text: string; results: SearchResults };

type ShownGroup = { group: SearchGroup; count: number; results: SearchResult[] };

function shownGroups(groups: SearchGroup[], results: SearchResults): ShownGroup[] {
  return groups
    .map((group) => ({ group, count: results[group.kind]?.count ?? 0, results: results[group.kind]?.results ?? [] }))
    .filter(({ count }) => count > 0);
}

/** "organizations, contacts and deals", from the groups' headings. */
function kindsOf(groups: SearchGroup[], last: "and" | "or") {
  const words = groups.map((group) => group.heading.toLowerCase());
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}` : words.join("");
}

/** Keyed by the text, so a reply to an older search lands under its own key and never replaces a newer one. */
function useFound(text: string) {
  return useQuery({
    queryKey: ["search", text],
    queryFn: async ({ signal }): Promise<Found> => ({
      text,
      results: await api<SearchResults>(`/search?${new URLSearchParams({ q: text })}`, { signal }),
    }),
    enabled: text !== "",
  });
}

function escapeForRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The name with the part that matches in semibold (K5). */
function Highlighted({ name, text }: { name: string; text: string }) {
  const match = new RegExp(escapeForRegExp(text), "iu").exec(name);
  if (!match) return name;
  const end = match.index + match[0].length;
  return (
    <>
      {name.slice(0, match.index)}
      <strong className="font-semibold">{match[0]}</strong>
      {name.slice(end)}
    </>
  );
}

const ROW = "flex cursor-pointer items-center gap-2 rounded-md px-2.5 data-[selected=true]:bg-page";
// cmdk draws each group's heading itself, so it's styled from the group.
const HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:leading-[18px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted";

function ResultGroup({ shown, text, onOpen }: { shown: ShownGroup; text: string; onOpen: (path: string) => void }) {
  const { group, count, results } = shown;
  return (
    <Command.Group heading={group.heading} className={`mt-1.5 first:mt-0 ${HEADING}`}>
      {results.map((result) => {
        const detail = group.detail(result);
        return (
          <Command.Item
            key={result.id}
            value={`${group.kind}-${result.id}`}
            onSelect={() => onOpen(group.address(result.id))}
            className={`${ROW} h-11`}
          >
            <span className="min-w-0 truncate">
              <Highlighted name={result.name} text={text} />
            </span>
            {group.chip?.(result)}
            {detail && (
              <span className="ml-auto max-w-[40%] flex-none truncate pl-2 text-[13px] text-muted">{detail}</span>
            )}
          </Command.Item>
        );
      })}
      {count > SHOWN && (
        <Command.Item
          value={`${group.kind}-all`}
          onSelect={() => onOpen(`/${group.kind}?${new URLSearchParams({ q: text })}`)}
          className={`${ROW} h-9 text-[13px] font-semibold`}
        >
          See all {count} {group.kind}
        </Command.Item>
      )}
    </Command.Group>
  );
}

function Message({ children }: { children: string }) {
  return (
    <p role="status" className="p-2.5 text-muted">
      {children}
    </p>
  );
}

type ResultsProps = {
  groups: SearchGroup[];
  found?: Found;
  failed: boolean;
  onOpen: (path: string) => void;
};

function Results({ groups, found, failed, onOpen }: ResultsProps) {
  if (failed) return <Message>Couldn't search. Try again.</Message>;
  if (!found) return null;
  const shown = shownGroups(groups, found.results);
  if (shown.length === 0) {
    const kinds = kindsOf(groups, "or");
    return <Message>{`No ${kinds} match "${found.text}".`}</Message>;
  }
  return (
    <Command.List
      label="Search results"
      className="max-h-[calc(var(--radix-popover-content-available-height)-12px)] overflow-y-auto"
    >
      {shown.map((group) => (
        <ResultGroup key={group.group.kind} shown={group} text={found.text} onOpen={onOpen} />
      ))}
    </Command.List>
  );
}

/** A lost connection has its own message across the top (N5), so the list adds none. */
function failedHere(error: unknown) {
  return Boolean(error) && !(error instanceof ApiError && error.kind === "connection");
}

/** The search box in the top bar, and its results (K1 to K7), in the groups each area gives it. */
export function Search({ groups }: { groups: SearchGroup[] }) {
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [text, setText] = useState("");
  const [wanted, setWanted] = useState("");
  const [open, setOpen] = useState(false);
  const search = useFound(wanted);

  // While the next search loads, the last results stay, so the list doesn't blink at
  // every pause. Clearing the box drops them, so a new search never starts from them.
  const [shown, setShown] = useState<Found>();
  if (search.data && search.data !== shown) setShown(search.data);

  useEffect(() => () => clearTimeout(pause.current), []);

  function type(value: string) {
    setText(value);
    clearTimeout(pause.current);
    const trimmed = value.trim();
    setOpen(trimmed !== "");
    if (trimmed === "") {
      setWanted("");
      setShown(undefined);
    } else {
      pause.current = setTimeout(() => setWanted(trimmed), PAUSE_MS);
    }
  }

  function openPage(path: string) {
    type("");
    navigate(path);
  }

  /** Opens the list, and tries a failed search again (K7). */
  function reopen() {
    if (text.trim() === "") return;
    setOpen(true);
    // A held-down arrow key repeats, and each press joins the try already on its way.
    if (search.isError) void search.refetch({ cancelRefetch: false });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) setOpen(false);
      else type("");
    } else if (event.key === "ArrowDown") {
      // cmdk moves through the results as well.
      reopen();
    }
  }

  const failed = failedHere(search.error);
  const showing = open && (failed || shown !== undefined);

  // cmdk always marks its input expanded, after any props given to it, so screen readers would
  // hear the list as open while it's closed. Set here instead; React leaves it, as cmdk's value never changes.
  useLayoutEffect(() => {
    input.current?.setAttribute("aria-expanded", String(showing));
  }, [showing]);

  return (
    <Command shouldFilter={false} label={`Search ${kindsOf(groups, "and")}`}>
      <Popover.Root open={showing} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div ref={box} className="relative w-[180px]">
            <Magnifier size={16} aria-hidden="true" className="absolute top-[10px] left-3 text-muted" />
            <Command.Input
              ref={input}
              value={text}
              onValueChange={type}
              onKeyDown={onKeyDown}
              onClick={reopen}
              maxLength={LONGEST}
              placeholder="Search"
              className="input h-9 pl-9"
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            // Focus stays in the box, where the arrow keys and Escape work, and Escape is handled there.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (box.current?.contains(event.target as Node)) event.preventDefault();
            }}
            onMouseDown={(event) => event.preventDefault()}
            className="z-50 w-[420px] rounded-card bg-raised p-1.5 shadow-(--shadow-popover)"
          >
            <Results groups={groups} found={shown} failed={failed} onOpen={openPage} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Command>
  );
}
