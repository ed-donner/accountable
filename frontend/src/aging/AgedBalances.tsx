import { format, parseISO } from "date-fns";
import { ToggleGroup } from "radix-ui";
import { useEffect } from "react";

import { LoadFailed } from "../components/LoadFailed";
import { PageHeader } from "../components/PageHeader";
import { formatDate } from "../lib/dates";
import { useAddress } from "../lib/useAddress";
import { useToday } from "../lib/useToday";
import { AgedTable, Legend } from "./AgedTable";
import { useAged, type View } from "./queries";

const VIEWS: { key: View; label: string; says: string }[] = [
  { key: "customers", label: "Customers", says: "Money customers owe on issued invoices, by how late it is." },
  { key: "suppliers", label: "Suppliers", says: "Money the business owes on bills, by how late it is." },
];

/** A day before today, written YYYY-MM-DD, which is the only kind the address keeps (X8). */
function isEarlierDay(text: string | null, today: string): text is string {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const day = parseISO(text);
  return !Number.isNaN(day.getTime()) && format(day, "yyyy-MM-dd") === text && text < today;
}

function viewIn(text: string | null): View {
  return text === "suppliers" ? "suppliers" : "customers";
}

function Placeholder() {
  return (
    <section aria-label="Aged balances" aria-busy="true" className="panel">
      <Legend />
      <div className="flex flex-col gap-3 px-4 py-4">
        {[0, 1, 2, 3, 4].map((place) => (
          <div key={place} data-testid="placeholder-row" className="h-3.5 animate-pulse rounded-full bg-page" />
        ))}
      </div>
    </section>
  );
}

/**
 * Who owes the business, and whom it owes, by how late (X1 to X20). The view and a chosen day are
 * kept in the address, as `view` and `on`, and today isn't, so a link doesn't open at yesterday (X8).
 */
export function AgedBalances() {
  const today = useToday();
  const { params, update } = useAddress();
  const view = viewIn(params.get("view"));
  const chosen = params.get("on");
  const on = isEarlierDay(chosen, today) ? chosen : null;
  const { data, error, isPending, refetch } = useAged(view, on);
  const says = VIEWS.find((one) => one.key === view)!.says;

  // A day that isn't a date, or isn't before today, is dropped and the report shows today.
  useEffect(() => {
    if (chosen !== null && !isEarlierDay(chosen, today)) update((next) => next.delete("on"));
  }, [chosen, today, update]);

  function chooseDay(day: string) {
    if (!day) return;
    update((next) => (isEarlierDay(day, today) ? next.set("on", day) : next.delete("on")));
  }

  function chooseView(next: string) {
    // Pressing the current view again would leave none chosen.
    if (!next) return;
    update((address) => (next === "suppliers" ? address.set("view", next) : address.delete("view")));
  }

  return (
    <>
      <PageHeader title="Aged balances">
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="aged-on" className="text-muted">
            Balances as of
          </label>
          <input
            id="aged-on"
            type="date"
            className="input num w-[160px]"
            max={today}
            value={on ?? today}
            onChange={(event) => chooseDay(event.target.value)}
          />
          {on && (
            <button type="button" className="btn btn-secondary" onClick={() => update((next) => next.delete("on"))}>
              Back to today
            </button>
          )}
        </div>
      </PageHeader>
      <div className="flex flex-col gap-3 px-6 pb-6">
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={chooseView}
          aria-label="View"
          className="inline-flex w-fit rounded-full bg-page"
        >
          {VIEWS.map((one) => (
            <ToggleGroup.Item
              key={one.key}
              value={one.key}
              className="h-9 cursor-pointer rounded-full px-5 font-semibold text-ink data-[state=on]:bg-sea-green data-[state=on]:text-midnight"
            >
              {one.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <p className="text-muted">
          {says}
          {on && <span className="ml-3 text-ink">Balances as of {formatDate(on)}</span>}
        </p>
        {error && <LoadFailed error={error} onRetry={() => void refetch()} onPage keeping={!!data} />}
        {isPending && !error && <Placeholder />}
        {data && <AgedTable key={`${view}-${on}`} aged={data} view={view} />}
      </div>
    </>
  );
}
