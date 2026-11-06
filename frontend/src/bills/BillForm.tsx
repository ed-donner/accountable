import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format, parseISO } from "date-fns";
import { useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { z } from "zod";

import { Field, messageId } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { RecordPicker } from "../components/RecordPicker";
import { useOrganizations, type OrganizationRow } from "../crm/queries";
import { parsePrice, price, priceText } from "../lib/money";
import { useNotify } from "../lib/notify";
import { showSaveError } from "../lib/saveErrors";
import { useCloseIfUnreadable } from "../lib/useCloseIfUnreadable";
import { useToday } from "../lib/useToday";
import { link } from "../lib/validate";
import { CATEGORIES } from "../components/charts/categories";
import { useSaveBill, type Bill, type BillDetail, type BillValues, type Category } from "./queries";
import { paidDateProblem } from "./status";

export const AMOUNT_MESSAGE = "Enter an amount in dollars and cents, such as 49.50";
const MAX_NUMBER_LENGTH = 50;
const PAID_HINT = "Leave blank if it isn't paid yet.";

/** 30 days on, fixed rather than the payment terms customers get (E5). Added to the plain date, so no zone can move it. */
export function dueDateFor(billDate: string): string {
  return format(addDays(parseISO(billDate), 30), "yyyy-MM-dd");
}

/** The total as typed, in whole cents, or null until the amount, and any tax, can be read. */
export function typedTotal(amount: string, tax: string): number | null {
  const amountCents = parsePrice(amount);
  const taxCents = tax.trim() === "" ? 0 : parsePrice(tax);
  return amountCents === null || taxCents === null ? null : amountCents + taxCents;
}

function isCategory(value: string): boolean {
  return CATEGORIES.some((category) => category.value === value);
}

// The amount boxes are called amount_cents and tax_cents, as the API's fields are, so the
// API's message for either lands beside its box. They hold what was typed, which becomes cents on sending.
function billSchema(today: string) {
  return z
    .object({
      organization_id: link(false, "Choose a supplier"),
      // zod counts characters, as the backend does.
      bill_number: z
        .string()
        .trim()
        .min(1, "Enter the bill number")
        .max(MAX_NUMBER_LENGTH, `Keep the bill number to ${MAX_NUMBER_LENGTH} characters or fewer`),
      category: z.string().refine(isCategory, "Choose a category"),
      bill_date: z.string().min(1, "Choose a bill date"),
      due_date: z.string().min(1, "Choose a due date"),
      amount_cents: z.string().refine((text) => parsePrice(text) !== null, AMOUNT_MESSAGE),
      tax_cents: z.string().refine((text) => text.trim() === "" || parsePrice(text) !== null, AMOUNT_MESSAGE),
      paid_on: z.string(),
      notes: z.string(),
    })
    .refine((bill) => bill.due_date >= bill.bill_date, {
      path: ["due_date"],
      message: "The due date can't be before the bill date",
    })
    .superRefine((bill, context) => {
      const problem = bill.paid_on && paidDateProblem(bill.paid_on, bill.bill_date, today);
      if (problem) context.addIssue({ code: "custom", path: ["paid_on"], message: problem });
    });
}

type Values = z.infer<ReturnType<typeof billSchema>>;

function initialValues(today: string, record?: Bill, defaultOrganizationId?: number): Values {
  if (!record) {
    return {
      organization_id: defaultOrganizationId ?? null,
      bill_number: "",
      category: "",
      bill_date: today,
      due_date: dueDateFor(today),
      amount_cents: "",
      tax_cents: "",
      paid_on: "",
      notes: "",
    };
  }
  return {
    organization_id: record.organization.id,
    bill_number: record.bill_number,
    category: record.category,
    bill_date: record.bill_date,
    due_date: record.due_date,
    amount_cents: priceText(record.amount_cents),
    tax_cents: priceText(record.tax_cents),
    paid_on: record.paid_on ?? "",
    notes: record.notes ?? "",
  };
}

/** What's sent: whole cents, a blank tax as none, and a blank paid date as unpaid (E4, E11). */
function toSend(values: Values): BillValues {
  return {
    organization_id: values.organization_id!,
    bill_number: values.bill_number,
    category: values.category as Category,
    bill_date: values.bill_date,
    due_date: values.due_date,
    amount_cents: parsePrice(values.amount_cents)!,
    tax_cents: values.tax_cents.trim() === "" ? 0 : parsePrice(values.tax_cents)!,
    paid_on: values.paid_on || null,
    notes: values.notes.trim() || null,
  };
}

type Props = {
  record?: Bill;
  /** Add bill on an organization's page brings it along as the supplier (E19). */
  defaultOrganizationId?: number;
  onClose: () => void;
  onSaved?: (saved: BillDetail) => void;
};

/** Adding and editing a bill (E16). It needs the organizations to pick a supplier from, and reads them once. */
export function BillForm(props: Props) {
  const organizations = useOrganizations();
  useCloseIfUnreadable([organizations], props.onClose);
  if (!organizations.data) return null;
  return <LoadedBillForm {...props} organizations={organizations.data} />;
}

function LoadedBillForm({ record, defaultOrganizationId, onClose, onSaved, organizations }: Props & Lists) {
  const today = useToday();
  const save = useSaveBill(record?.id);
  const notify = useNotify();
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    getValues,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(billSchema(today)),
    defaultValues: initialValues(today, record, defaultOrganizationId),
  });
  // The due date follows the bill date until it's typed in. Editing keeps the saved one (E5).
  const [dueTyped, setDueTyped] = useState(record !== undefined);

  function followBillDate(billDate: string) {
    if (dueTyped || !billDate) return;
    setValue("due_date", dueDateFor(billDate));
    clearErrors("due_date");
  }

  async function submit(values: Values) {
    try {
      const saved = await save.mutateAsync(toSend(values));
      notify.success("Bill saved.");
      onSaved?.(saved);
      onClose();
    } catch (error) {
      showSaveError(error, { setError, getValues, notify });
    }
  }

  return (
    <FormDialog
      title={record ? "Edit bill" : "Add bill"}
      submitLabel="Save bill"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Field label="Supplier" htmlFor="bill-supplier" error={errors.organization_id?.message}>
        <Controller
          control={control}
          name="organization_id"
          render={({ field }) => (
            <RecordPicker
              id="bill-supplier"
              label="Supplier"
              noun="organization"
              value={field.value}
              options={organizations}
              placeholder="Choose a supplier"
              invalid={!!errors.organization_id}
              onChange={(id) => {
                field.onChange(id);
                clearErrors("organization_id");
              }}
            />
          )}
        />
      </Field>
      <Field label="Bill number" htmlFor="bill-number" error={errors.bill_number?.message}>
        <input
          id="bill-number"
          className="input num"
          aria-invalid={!!errors.bill_number}
          {...register("bill_number")}
        />
      </Field>
      <Field label="Category" htmlFor="bill-category" error={errors.category?.message}>
        <select id="bill-category" className="input" aria-invalid={!!errors.category} {...register("category")}>
          <option value="" disabled>
            Choose a category
          </option>
          {CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Bill date" htmlFor="bill-date" error={errors.bill_date?.message}>
          <input
            id="bill-date"
            type="date"
            className="input num"
            aria-invalid={!!errors.bill_date}
            {...register("bill_date", { onChange: (event) => followBillDate(event.target.value) })}
          />
        </Field>
        <Field label="Due date" htmlFor="bill-due-date" error={errors.due_date?.message}>
          <input
            id="bill-due-date"
            type="date"
            className="input num"
            aria-invalid={!!errors.due_date}
            {...register("due_date", { onChange: () => setDueTyped(true) })}
          />
        </Field>
        <MoneyBox id="bill-amount" label="Amount" error={errors.amount_cents?.message} {...register("amount_cents")} />
        <MoneyBox id="bill-tax" label="Tax" error={errors.tax_cents?.message} {...register("tax_cents")} />
      </div>
      <Total control={control} />
      <Field label="Paid on" htmlFor="bill-paid-on" error={errors.paid_on?.message} hint={PAID_HINT}>
        <input
          id="bill-paid-on"
          type="date"
          className="input num"
          aria-invalid={!!errors.paid_on}
          aria-describedby={messageId("bill-paid-on")}
          {...register("paid_on")}
        />
      </Field>
      <Field label="Notes" htmlFor="bill-notes" error={errors.notes?.message}>
        <textarea id="bill-notes" rows={4} className="input" {...register("notes")} />
      </Field>
    </FormDialog>
  );
}

type Lists = { organizations: OrganizationRow[] };

type MoneyBoxProps = ReturnType<ReturnType<typeof useForm<Values>>["register"]> & {
  id: string;
  label: string;
  error?: string;
};

/** A box for dollars and cents, with $ at its start and its figures in JetBrains Mono. */
function MoneyBox({ id, label, error, ...field }: MoneyBoxProps) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="relative">
        <span aria-hidden="true" className="num pointer-events-none absolute top-[9px] left-3 text-muted">
          $
        </span>
        <input id={id} inputMode="decimal" className="input num pl-7" aria-invalid={!!error} {...field} />
      </div>
    </Field>
  );
}

/** The amount and the tax added as they're typed, for show only: the backend works out the total it saves. */
function Total({ control }: { control: Control<Values> }) {
  const [amount, tax] = useWatch({ control, name: ["amount_cents", "tax_cents"] });
  const total = typedTotal(amount, tax);
  return (
    <p aria-live="polite" className="flex items-baseline gap-2" data-testid="bill-total">
      <span className="text-[13px] leading-[18px] font-semibold">Total</span>
      {total !== null && <span className="num text-[16px] leading-6 font-medium">{price(total)}</span>}
    </p>
  );
}
