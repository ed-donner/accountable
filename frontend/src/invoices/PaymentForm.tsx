import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field, messageId } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { parsePrice, price, priceText } from "../lib/money";
import { useNotify } from "../lib/notify";
import { showSaveError } from "../lib/saveErrors";
import { useToday } from "../lib/useToday";
import { useRecordPayment, type InvoiceDetail, type Method } from "./queries";
import { METHODS } from "./status";

export const DATE_MESSAGE = "Enter the date it was paid";
export const DATE_IN_FUTURE = "A payment can't be dated in the future";
export const DATE_BEFORE_ISSUE = "A payment can't be dated before the invoice was issued";
export const AMOUNT_MESSAGE = "Enter an amount more than $0.00";
export const METHOD_MESSAGE = "Choose how it was paid";
export const REFERENCE_TOO_LONG = "Keep the reference to 100 characters or fewer";

/** Named as the backend names them, so its messages land beside them. The amount is as typed. */
type PaymentValues = { paid_on: string; amount_cents: string; method: string; reference: string };

/** V15's rules, against what's owed and the dates as they are when the form opens. ISO dates compare as text. */
function paymentSchema(owed: number, issued: string, today: string) {
  return z
    .object({ paid_on: z.string(), amount_cents: z.string(), method: z.string(), reference: z.string() })
    .superRefine((values, context) => {
      const problem = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.paid_on)) problem("paid_on", DATE_MESSAGE);
      else if (values.paid_on > today) problem("paid_on", DATE_IN_FUTURE);
      else if (values.paid_on < issued) problem("paid_on", DATE_BEFORE_ISSUE);
      const cents = parsePrice(values.amount_cents);
      if (cents === null || cents === 0) problem("amount_cents", AMOUNT_MESSAGE);
      else if (cents > owed) problem("amount_cents", `That's more than the ${price(owed)} still owed`);
      if (!METHODS.some(({ key }) => key === values.method)) problem("method", METHOD_MESSAGE);
      if ([...values.reference.trim()].length > 100) problem("reference", REFERENCE_TOO_LONG);
    });
}

/**
 * Record payment (V15): the date today, the amount what's still owed, and Bank transfer, to
 * start with. The backend checks the amount again inside its own save (V16).
 */
export function PaymentForm({ invoice, onClose }: { invoice: InvoiceDetail; onClose: () => void }) {
  const today = useToday();
  const record = useRecordPayment(invoice.id);
  const notify = useNotify();
  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema(invoice.owed_cents, invoice.issue_date!, today)),
    defaultValues: {
      paid_on: today,
      amount_cents: priceText(invoice.owed_cents),
      method: "bank_transfer",
      reference: "",
    },
  });
  const {
    register,
    formState: { errors },
  } = form;

  async function save(values: PaymentValues) {
    try {
      await record.mutateAsync({
        paid_on: values.paid_on,
        amount_cents: parsePrice(values.amount_cents)!,
        method: values.method as Method,
        reference: values.reference.trim() || null,
      });
      notify.success("Payment recorded.");
      onClose();
    } catch (error) {
      showSaveError(error, { setError: form.setError, getValues: form.getValues, notify });
    }
  }

  const described = (id: string, error?: string) => (error ? messageId(id) : undefined);
  return (
    <FormDialog
      title="Record payment"
      submitLabel="Record payment"
      pending={record.isPending}
      onClose={onClose}
      onSubmit={(event) => form.handleSubmit(save)(event)}
    >
      <Field label="Date" htmlFor="payment-date" error={errors.paid_on?.message}>
        <input
          id="payment-date"
          type="date"
          className="input"
          max={today}
          aria-invalid={!!errors.paid_on}
          aria-describedby={described("payment-date", errors.paid_on?.message)}
          {...register("paid_on")}
        />
      </Field>
      <Field label="Amount" htmlFor="payment-amount" error={errors.amount_cents?.message}>
        <div className="relative">
          <span className="num pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
          <input
            id="payment-amount"
            className="input num pl-7"
            inputMode="decimal"
            aria-invalid={!!errors.amount_cents}
            aria-describedby={described("payment-amount", errors.amount_cents?.message)}
            {...register("amount_cents")}
          />
        </div>
      </Field>
      <Field label="Method" htmlFor="payment-method" error={errors.method?.message}>
        <select id="payment-method" className="input" {...register("method")}>
          {METHODS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Reference"
        htmlFor="payment-reference"
        error={errors.reference?.message}
        hint="Such as a check number."
      >
        <input
          id="payment-reference"
          className="input"
          aria-invalid={!!errors.reference}
          aria-describedby={messageId("payment-reference")}
          {...register("reference")}
        />
      </Field>
    </FormDialog>
  );
}
