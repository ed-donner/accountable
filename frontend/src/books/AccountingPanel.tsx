import { LoadFailed } from "../components/LoadFailed";
import { SidePanel } from "../components/RecordLayout";
import { EntryList } from "./EntryList";
import { useRecordEntries, type RecordKind } from "./queries";

type Props = {
  kind: RecordKind;
  id: number;
  /** A payment's panel has no heading of its own, because it sits under the payment's row (J19). */
  heading?: boolean;
  /** Holds the read back until the panel is wanted, such as a payment's, which opens on a button. */
  enabled?: boolean;
};

function Entries({ kind, id, enabled }: Required<Pick<Props, "kind" | "id" | "enabled">>) {
  const entries = useRecordEntries(kind, id, enabled);
  if (entries.error && !entries.data) {
    return <LoadFailed error={entries.error} onRetry={() => void entries.refetch()} />;
  }
  if (!entries.data) return <p className="py-1 text-muted">Loading...</p>;
  return (
    <>
      <LoadFailed keeping error={entries.error} onRetry={() => void entries.refetch()} />
      {entries.data.length === 0 ? (
        <p className="py-1 text-muted">No entries.</p>
      ) : (
        <EntryList entries={entries.data} />
      )}
    </>
  );
}

/**
 * The entries one invoice, payment or bill made, oldest first, reversals included (J19). Read only, and
 * the one thing outside books/ that the invoice and bill pages import.
 */
export function AccountingPanel({ kind, id, heading = true, enabled = true }: Props) {
  const body = <Entries kind={kind} id={id} enabled={enabled} />;
  if (heading) return <SidePanel title="Accounting">{body}</SidePanel>;
  return (
    <section aria-label="Accounting" className="mt-1 mb-1.5">
      {body}
    </section>
  );
}
