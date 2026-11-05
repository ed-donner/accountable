import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import type { Money } from "../queries";

const NAMES: Record<Money["groups"][number]["key"], string> = {
  not_due: "Not yet due",
  "1_30": "1 to 30 days",
  "31_60": "31 to 60 days",
  "61_90": "61 to 90 days",
  over_90: "Over 90 days",
};

/**
 * What's owed in five groups by days late (V29): bars sized against the largest, Not yet due in
 * Cerulean as information and the late ones in Raspberry as alerts, each named beside its bar.
 */
export function HowLate({ groups }: { groups: Money["groups"] }) {
  const largest = Math.max(...groups.map((group) => group.cents), 1);
  return (
    <ul aria-label="How late" className="flex flex-col gap-2">
      {groups.map((group) => (
        <li
          key={group.key}
          className="grid grid-cols-[96px_minmax(0,1fr)_120px_24px] items-center gap-3"
          data-testid={`late-${group.key}`}
        >
          <span className="text-[13px] leading-[18px] font-semibold whitespace-nowrap">{NAMES[group.key]}</span>
          <span className="h-2.5 min-w-0">
            {group.cents > 0 && (
              <span
                className={`block h-full rounded ${group.key === "not_due" ? "bg-cerulean" : "bg-raspberry"}`}
                style={{ width: `${Math.max((group.cents / largest) * 100, 2)}%` }}
              />
            )}
          </span>
          <span className="num text-right text-[13px]">{price(group.cents)}</span>
          <span className="num text-right text-[13px] text-muted" aria-label={plural(group.count, "invoice")}>
            {group.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
