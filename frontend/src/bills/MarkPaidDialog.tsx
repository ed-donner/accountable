import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { useNotify } from "../lib/notify";
import { showSaveError } from "../lib/saveErrors";
import { useToday } from "../lib/useToday";
import { usePaid, type Bill } from "./queries";
import { paidDateProblem } from "./status";

function paidSchema(billDate: string, today: string) {
  return z.object({ paid_on: z.string().min(1, "Choose a paid date") }).superRefine(({ paid_on }, context) => {
    const problem = paidDateProblem(paid_on, billDate, today);
    if (problem) context.addIssue({ code: "custom", path: ["paid_on"], message: problem });
  });
}

type Values = z.infer<ReturnType<typeof paidSchema>>;

type Props = {
  bill: Pick<Bill, "id" | "bill_number" | "bill_date">;
  onClose: () => void;
  /** Where focus goes if the button that opened the dialog has gone, such as when its row leaves the table. */
  onOpenerGone?: () => void;
};

/** Asks the date the bill was paid, with today filled in, and marks it paid on that date (E9). */
export function MarkPaidDialog({ bill, onClose, onOpenerGone }: Props) {
  const today = useToday();
  const { markPaid, pending } = usePaid();
  const notify = useNotify();
  // Read as the dialog opens, before it takes focus, so focus can go back there (Q3).
  const [opener] = useState(() => document.activeElement);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(paidSchema(bill.bill_date, today)), defaultValues: { paid_on: today } });

  async function submit(values: Values) {
    try {
      await markPaid(bill.id, values.paid_on);
      onClose();
    } catch (error) {
      showSaveError(error, { setError, getValues, notify });
    }
  }

  function returnFocus() {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    else onOpenerGone?.();
  }

  return (
    <FormDialog
      title={`Mark bill ${bill.bill_number} paid`}
      submitLabel="Mark paid"
      pending={pending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
      onCloseFocus={returnFocus}
    >
      <Field label="Paid on" htmlFor="mark-paid-on" error={errors.paid_on?.message}>
        <input
          id="mark-paid-on"
          type="date"
          className="input num"
          aria-invalid={!!errors.paid_on}
          {...register("paid_on")}
        />
      </Field>
    </FormDialog>
  );
}
