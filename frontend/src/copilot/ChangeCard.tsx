import type { CardField, ChangeEntry, FieldKind } from "./queries";
import { RecordLink } from "./Step";

/** Numbers are in JetBrains Mono, so a card's money, dates and percentages are too (Visual design). */
const IN_MONO: readonly FieldKind[] = ["money", "date", "percent"];

function Value({ text, kind }: { text: string; kind: FieldKind }) {
  return <span className={IN_MONO.includes(kind) ? "num text-[13px]" : undefined}>{text}</span>;
}

/** "Stage: from Proposal to Negotiation", or "Name: Harbor & Pine" for a new record. */
function FieldLine({ field }: { field: CardField }) {
  return (
    <div>
      <dt className="inline text-muted">{field.name}:</dt>{" "}
      <dd className="inline">
        {field.now !== null && (
          <>
            <span className="text-muted">from </span>
            <Value text={field.now} kind={field.kind} />
            <span className="text-muted"> to </span>
          </>
        )}
        <Value text={field.after} kind={field.kind} />
      </dd>
    </div>
  );
}

type Props = { entry: ChangeEntry; onConfirm: () => void; onCancel: () => void };

/**
 * What a change will do, in the backend's words, with its own button and Cancel (Z13). Both are off
 * while it runs, and once it's answered they give way to what happened (Z15, Z16).
 */
export function ChangeCard({ entry, onConfirm, onCancel }: Props) {
  const { card, state, outcome } = entry;
  return (
    <div className="rounded-card bg-page p-4">
      <h3 className="font-semibold">{card.title}</h3>
      <dl className="mt-2 flex flex-col gap-1">
        {card.fields.map((field) => (
          <FieldLine key={field.name} field={field} />
        ))}
      </dl>
      {card.note && <p className="mt-2">{card.note}</p>}
      {state !== "answered" && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-primary" disabled={state === "running"} onClick={onConfirm}>
            {card.button}
          </button>
          <button type="button" className="btn bg-raised text-ink" disabled={state === "running"} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
      {outcome && (
        <p className="mt-3">
          <RecordLink words={outcome.words} link={outcome.link} />
        </p>
      )}
    </div>
  );
}
