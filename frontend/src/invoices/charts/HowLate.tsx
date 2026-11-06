import { latePart } from "../../components/charts/lateness";
import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import type { Money } from "../queries";

/**
 * What's owed in five groups by days late (V29): bars sized against the largest, each group in its
 * own color from Cerulean to Deep Raspberry (X12), and named beside its bar.
 * The rows spread over the panel's height, as the timeline beside it does.
 */
export function HowLate({ groups }: { groups: Money["groups"] }) {
  // Near enough for a bar's width, however large. The figures beside them are exact.
  const drawn = groups.map((group) => Number(group.cents));
  const largest = Math.max(...drawn, 1);
  return (
    <ul aria-label="How late" className="flex flex-1 flex-col justify-between pt-2 pb-1">
      {groups.map((group, index) => (
        <li
          key={group.key}
          className="grid grid-cols-[96px_minmax(0,1fr)_120px_24px] items-center gap-3"
          data-testid={`late-${group.key}`}
        >
          <span className="text-[13px] leading-[18px] font-semibold whitespace-nowrap">
            {latePart(group.key).label}
          </span>
          <span className="h-2.5 min-w-0">
            {drawn[index] > 0 && (
              <span
                className="block h-full rounded"
                style={{
                  backgroundColor: latePart(group.key).color,
                  width: `${Math.max((drawn[index] / largest) * 100, 2)}%`,
                }}
              />
            )}
          </span>
          <span className="num text-right text-[13px]">{price(BigInt(group.cents))}</span>
          <span className="num text-right text-[13px] text-muted" aria-label={plural(group.count, "invoice")}>
            {group.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
