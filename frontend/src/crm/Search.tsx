import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Search as Magnifier } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

import { ApiError, api } from "../lib/api";
import type { RecordKind, Stage } from "./queries";
import { StageChip } from "./StageChip";

/** How long typing has to pause before the search is sent (K3). */
export const PAUSE_MS = 150;
const SHOWN = 5;
const LONGEST = 100;
const LABEL = "Search organizations, contacts and deals";

type Group<T> = { count: number; results: T[] };
export type SearchResults = {
  organizations: Group<{ id: number; name: string; industry: string | null }>;
  contacts: Group<{ id: number; name: string; organization_name: string | null }>;
  deals: Group<{ id: number; name: string; stage: Stage; organization_name: string | null }>;
};

/** A reply with the text it answers, which may be an earlier one than the box now holds. */
type Found = { text: string; results: SearchResults };

type Result = { id: number; name: string; detail: string | null; stage?: Stage };
type ShownGroup = { kind: RecordKind; heading: string; count: number; results: Result[] };

function groupsOf({ organizations, contacts, deals }: SearchResults): ShownGroup[] {
  const groups: ShownGroup[] = [
    {
      kind: "organizations",
      heading: "Organizations",
      count: organizations.count,
      results: organizations.results.map(({ id, name, industry }) => ({ id, name, detail: industry })),
    },
    {
      kind: "contacts",
      heading: "Contacts",
      count: contacts.count,
      results: contacts.results.map(({ id, name, organization_name }) => ({ id, name, detail: organization_name })),
    },
    {
      kind: "deals",
      heading: "Deals",
      count: deals.count,
      results: deals.results.map(({ id, name, stage, organization_name }) => ({
        id,
        name,
        stage,
        detail: organization_name,
      })),
    },
  ];
  return groups.filter((group) => group.count > 0);
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

function ResultGroup({ group, text, onOpen }: { group: ShownGroup; text: string; onOpen: (path: string) => void }) {
  const { kind, heading, count, results } = group;
  return (
    <Command.Group heading={heading} className={`mt-1.5 first:mt-0 ${HEADING}`}>
      {results.map((result) => (
        <Command.Item
          key={result.id}
          value={`${kind}-${result.id}`}
          onSelect={() => onOpen(`/${kind}/${result.id}`)}
          className={`${ROW} h-11`}
        >
          <span className="min-w-0 truncate">
            <Highlighted name={result.name} text={text} />
          </span>
          {result.stage && <StageChip stage={result.stage} />}
          {result.detail && (
            <span className="ml-auto max-w-[40%] flex-none truncate pl-2 text-[13px] text-muted">{result.detail}</span>
          )}
        </Command.Item>
      ))}
      {count > SHOWN && (
        <Command.Item
          value={`${kind}-all`}
          onSelect={() => onOpen(`/${kind}?${new URLSearchParams({ q: text })}`)}
          className={`${ROW} h-9 text-[13px] font-semibold`}
        >
          See all {count} {kind}
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

function Results({ found, failed, onOpen }: { found?: Found; failed: boolean; onOpen: (path: string) => void }) {
  if (failed) return <Message>Couldn't search. Try again.</Message>;
  if (!found) return null;
  const groups = groupsOf(found.results);
  if (groups.length === 0) {
    return <Message>{`No organizations, contacts or deals match "${found.text}".`}</Message>;
  }
  return (
    <Command.List
      label="Search results"
      className="max-h-[calc(var(--radix-popover-content-available-height)-12px)] overflow-y-auto"
    >
      {groups.map((group) => (
        <ResultGroup key={group.kind} group={group} text={found.text} onOpen={onOpen} />
      ))}
    </Command.List>
  );
}

/** A lost connection has its own message across the top (N5), so the list adds none. */
function failedHere(error: unknown) {
  return Boolean(error) && !(error instanceof ApiError && error.kind === "connection");
}

/** The search box in the top bar, and its results (K1 to K7). */
export function Search() {
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
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

  function reopen() {
    if (text.trim() === "") return;
    setOpen(true);
    if (search.isError) void search.refetch();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) setOpen(false);
      else type("");
    } else if (event.key === "ArrowDown" && !open) {
      reopen();
    }
  }

  const failed = failedHere(search.error);
  const showing = open && (failed || shown !== undefined);

  return (
    <Command shouldFilter={false} label={LABEL}>
      <Popover.Root open={showing} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div ref={box} className="relative w-[240px]">
            <Magnifier size={16} aria-hidden="true" className="absolute top-[10px] left-3 text-muted" />
            <Command.Input
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
            <Results found={shown} failed={failed} onOpen={openPage} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Command>
  );
}
