import { useState } from "react";
import { useNavigate } from "react-router";

import { Confirm } from "../components/Confirm";
import { Field } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { RecordPicker } from "../components/RecordPicker";
import { isOpen } from "../crm/deals";
import { useDeals } from "../crm/queries";
import { acceptChanges } from "./status";

const CHOOSE_A_DEAL = "Choose an open deal";

/** New quote, from the Quotes section, asks which open deal first, with no offer to add one (Q8). */
export function NewQuoteDialog({ onClose }: { onClose: () => void }) {
  const deals = useDeals();
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

type AcceptProps = AskFirst & { deal: string; subtotalCents: number; declining: string[] };

/** Accept names everything it will change on the deal (Q22). */
export function AcceptDialog({ number, deal, subtotalCents, declining, pending, ...actions }: AcceptProps) {
  return (
    <Confirm
      {...actions}
      tone="primary"
      title={`Accept ${number}?`}
      message={acceptChanges(deal, subtotalCents, declining)}
      confirmLabel="Accept quote"
      disabled={pending}
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
