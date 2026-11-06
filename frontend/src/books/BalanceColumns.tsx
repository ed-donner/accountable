import { Check, TriangleAlert } from "lucide-react";

import { Chip } from "../components/Chip";
import { price } from "../lib/money";
import { ROWS, totals as totalsOf, type Figure } from "./balance";

const HEADINGS = { left: "What the business owns", right: "What it owes and what's the owner's" } as const;
const LEFT_SENTENCE = "What the business owns";
const RIGHT_SENTENCE = "What it owes and what belongs to the owner";

type Props = {
  /** The six figures, or none while the first read is on its way, when the columns show only their names. */
  figures: Figure[] | null;
  /** Opens the entries behind a figure, given the button to give focus back to. */
  onOpen: (figure: Figure, opener: HTMLElement) => void;
};

function Column({
  side,
  figures,
  onOpen,
}: {
  side: Figure["side"];
  figures: Figure[] | null;
  onOpen: Props["onOpen"];
}) {
  const rows = (figures ?? ROWS.map((row) => ({ ...row, cents: null }))).filter((row) => row.side === side);
  const total = figures && totalsOf(figures)[side];
  return (
    <section aria-label={HEADINGS[side]}>
      <h2>{HEADINGS[side]}</h2>
      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.id} className="flex min-h-[34px] items-center gap-3">
            <span aria-hidden="true" className={`size-3 flex-none rounded-full ${row.swatch}`} />
            <span className="min-w-0 flex-1">{row.name}</span>
            {row.cents !== null && (
              <button
                type="button"
                aria-label={`${row.name}: ${price(row.cents)}`}
                className="num text-[20px] leading-[26px] font-medium hover:underline"
                onClick={(event) => onOpen(row as Figure, event.currentTarget)}
              >
                {price(row.cents)}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 flex min-h-[30px] items-center justify-between gap-3 font-semibold">
        <span>Total</span>
        {total !== null && <span className="num text-[24px] leading-[30px] font-medium">{price(total)}</span>}
      </p>
    </section>
  );
}

/** The sides compared, in plain words, when they differ (X6). */
function sentence(difference: bigint) {
  const more =
    difference > 0n
      ? [LEFT_SENTENCE, "what it owes and what belongs to the owner"]
      : [RIGHT_SENTENCE, "what the business owns"];
  return { more: more[0], less: more[1], size: difference > 0n ? difference : -difference };
}

function Mark({ figures }: { figures: Figure[] }) {
  const { balanced, difference } = totalsOf(figures);
  if (balanced) {
    return (
      <Chip tone="seaGreen">
        <Check size={14} aria-hidden="true" className="mr-1" />
        The two sides are equal.
      </Chip>
    );
  }
  const { more, less, size } = sentence(difference);
  return (
    <div className="flex flex-col items-center gap-2 text-center" role="alert">
      <Chip tone="alert">
        <TriangleAlert size={14} aria-hidden="true" className="mr-1" />
        Out of balance
      </Chip>
      <p>
        {more} is <span className="num">{price(size)}</span> more than {less}.
      </p>
    </div>
  );
}

/**
 * The two columns of figures, what the business owns on the left and what it owes and what
 * belongs to the owner on the right, each ending in its total, with the mark between them (X4 to X6).
 */
export function BalanceColumns({ figures, onOpen }: Props) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-12">
        <Column side="left" figures={figures} onOpen={onOpen} />
        <Column side="right" figures={figures} onOpen={onOpen} />
      </div>
      <div className="mt-6 flex min-h-[22px] justify-center">{figures && <Mark figures={figures} />}</div>
    </div>
  );
}
