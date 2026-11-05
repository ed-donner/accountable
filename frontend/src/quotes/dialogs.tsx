import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { Confirm } from "../components/Confirm";
import { Field } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { RecordPicker } from "../components/RecordPicker";
import { isOpen } from "../crm/deals";
import { useDeals } from "../crm/queries";
import { useCloseIfUnreadable } from "../lib/useCloseIfUnreadable";
import { acceptChanges } from "./status";

const CHOOSE_A_DEAL = "Choose an open deal";

/**
 * New quote, from the Quotes section, asks which open deal first, with no offer to add one (Q8).
 * If the deals can't be read it closes and says so, rather than offering none (F11).
 */
export function NewQuoteDialog({ onClose }: { onClose: () => void }) {
  const deals = useDeals();
  useCloseIfUnreadable([deals], onClose);
  const navigate = useNavigate();
  const [deal, setDeal] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();
  const options = (deals.data ?? [])
    .filter((row) => isOpen(row.stage))
    .map((row) => ({ id: row.id, name: row.name, hint: row.organization_name }));

  async function submit() {
    if (deal === null) setError(CHOOSE_A_DEAL);
    else navigate(`/quotes/new?deal=${deal}`);
  }

  return (
    <FormDialog title="New quote" submitLabel="Continue" onClose={onClose} onSubmit={submit}>
      <Field label="Deal" htmlFor="new-quote-deal" error={error}>
        <RecordPicker
          id="new-quote-deal"
          label="Deal"
          noun="open deal"
          value={deal}
          options={options}
          invalid={!!error}
          onChange={(chosen) => {
            setDeal(chosen);
            setError(undefined);
          }}
        />
      </Field>
    </FormDialog>
  );
}

type AskFirst = {
  number: string;
  pending?: boolean;
  /** Resolves when the change has finished, so a second press can't start another. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

/** Mark as sent asks first, because a sent quote can't be changed (Q20). */
export function SendDialog({ number, pending, ...actions }: AskFirst) {
  return (
    <Confirm
      {...actions}
      tone="primary"
      title={`Mark ${number} as sent?`}
      message="It can't be changed after this. To change it later, copy it to a new draft."
      confirmLabel="Mark as sent"
      disabled={pending}
    />
  );
}

type AcceptProps = AskFirst & {
  deal: string;
  subtotalCents: number;
  /** The deal's other sent quotes, which accepting declines, or null until they've been read. */
  declining: string[] | null;
  /** They couldn't be read. */
  readFailed: boolean;
  onRetry: () => void;
};

/**
 * Accept names everything it will change on the deal, so it waits until it knows which of the
 * deal's quotes it will decline, and won't go ahead if they can't be read (Q22, N6).
 */
export function AcceptDialog({
  number,
  deal,
  subtotalCents,
  declining,
  readFailed,
  onRetry,
  pending,
  ...actions
}: AcceptProps) {
  let message: ReactNode = "Checking this deal's other quotes…";
  if (declining) message = acceptChanges(deal, subtotalCents, declining);
  else if (readFailed) {
    message = (
      <>
        Couldn&apos;t check this deal&apos;s other quotes, so it can&apos;t be accepted right now.{" "}
        <button type="button" className="link" onClick={onRetry}>
          Try again
        </button>
      </>
    );
  }
  return (
    <Confirm
      {...actions}
      tone="primary"
      title={`Accept ${number}?`}
      message={message}
      confirmLabel="Accept quote"
      disabled={pending || declining === null}
    />
  );
}

/** Decline isn't a delete, so its button isn't Raspberry (Q24). */
export function DeclineDialog({ number, pending, ...actions }: AskFirst) {
  return (
    <Confirm
      {...actions}
      tone="primary"
      title={`Decline ${number}?`}
      message="This can't be undone."
      confirmLabel="Decline quote"
      disabled={pending}
    />
  );
}
