import { Command } from "cmdk";
import { Plus, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";
import { useFieldArray, useFormContext, useWatch, type FieldError } from "react-hook-form";
import { z } from "zod";

import type { CompanySettings } from "../company/settings";
import { MAX_SUBTOTAL_CENTS, QUANTITY_MESSAGE, SUBTOTAL_MESSAGE, parseQuantity, totals } from "../company/tax";
import { Field, messageId } from "../components/Field";
import { SidePanel } from "../components/RecordLayout";
import { parsePrice, price, priceText } from "../lib/money";
import { useProducts } from "../products/queries";
import { companyMessage, fieldMessage, lineNameMessage, unprintable } from "./characters";
import type { DraftRequest, InvoiceDetail } from "./queries";

export const BILL_TO_BLANK = "Enter who the invoice is for";
export const BILL_TO_TOO_LONG = "Keep the Bill to to 6 lines and 500 characters";
export const DESCRIPTION_TOO_LONG = "Keep the description to 1,000 characters or fewer";
export const PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50";
export const NO_LINES = "Add a line before issuing";
export const TOO_MANY_LINES = "An invoice can have up to 100 lines";
export const NOTHING_TO_PAY = "The total must be more than $0.00 to issue.";
export const NO_ORGANIZATION = "This deal has no organization. Choose one on the deal before issuing.";
export const NO_COMPANY_NAME = "Enter the company's name in Company settings before issuing.";

const MAX_LINES = 100;
const MAX_BILL_TO_LINES = 6;
const MAX_BILL_TO_CHARACTERS = 500;
const MAX_DESCRIPTION = 1000;

/** A line as the form holds it, its quantity and price as typed. A line not yet saved has no id. */
export type DraftLineValues = {
  id: number | null;
  product_id: number;
  /** Taken from the product when the line was added, and never changed on the draft (V6). */
  name: string;
  description: string;
  /** As typed. Named as the backend names it, as is the price, so its messages land beside them. */
  quantity: string;
  unit_price_cents: string;
};

export type DraftValues = { bill_to: string; lines: DraftLineValues[] };

export function toDraftValues(invoice: InvoiceDetail): DraftValues {
  return {
    bill_to: invoice.bill_to ?? "",
    lines: invoice.lines.map((line) => ({
      id: line.id,
      product_id: line.product_id,
      name: line.name,
      description: line.description ?? "",
      quantity: String(line.quantity),
      unit_price_cents: priceText(line.unit_price_cents),
    })),
  };
}

/** Characters as the backend counts them, one for each, whatever JavaScript makes of it. */
function length(text: string) {
  return [...text].length;
}

/** The lines as numbers, with 0 for what isn't one yet, so the figures and the preview follow what's typed. */
export function typedLines(lines: DraftLineValues[]) {
  return lines.map((line) => ({
    ...line,
    quantity: parseQuantity(line.quantity) ?? 0,
    unit_price_cents: parsePrice(line.unit_price_cents) ?? 0,
  }));
}

export function toDraftRequest(values: DraftValues): DraftRequest {
  return {
    bill_to: values.bill_to.trim() || null,
    lines: typedLines(values.lines).map((line) => ({
      ...(line.id === null ? {} : { id: line.id }),
      product_id: line.product_id,
      description: line.description.trim() || null,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
    })),
  };
}

type Issue = { path: (string | number)[]; message: string };

function billToProblems(typed: string): Issue[] {
  const billTo = typed.trim();
  const tooLong = length(billTo) > MAX_BILL_TO_CHARACTERS || billTo.split("\n").length > MAX_BILL_TO_LINES;
  if (tooLong) return [{ path: ["bill_to"], message: BILL_TO_TOO_LONG }];
  const found = unprintable(billTo);
  return found.length ? [{ path: ["bill_to"], message: fieldMessage(found) }] : [];
}

function lineProblems(line: DraftLineValues, place: number): Issue[] {
  const issues: Issue[] = [];
  const description = line.description.trim();
  const unshown = unprintable(description);
  if (length(description) > MAX_DESCRIPTION) issues.push({ path: ["description"], message: DESCRIPTION_TOO_LONG });
  else if (unshown.length) issues.push({ path: ["description"], message: fieldMessage(unshown) });
  if (parseQuantity(line.quantity) === null) issues.push({ path: ["quantity"], message: QUANTITY_MESSAGE });
  if (parsePrice(line.unit_price_cents) === null) issues.push({ path: ["unit_price_cents"], message: PRICE_MESSAGE });
  const nameUnshown = unprintable(line.name);
  if (nameUnshown.length) issues.push({ path: ["name"], message: lineNameMessage(nameUnshown) });
  return issues.map((issue) => ({ ...issue, path: ["lines", place, ...issue.path] }));
}

/** Every rule a save keeps to (V8, V9), as the backend checks them, so most mistakes never reach it. */
export function draftProblems(values: DraftValues): Issue[] {
  const issues = [...billToProblems(values.bill_to), ...values.lines.flatMap(lineProblems)];
  if (values.lines.length > MAX_LINES) issues.push({ path: ["lines"], message: TOO_MANY_LINES });
  else if (totals(typedLines(values.lines), "0").subtotal_cents > MAX_SUBTOTAL_CENTS) {
    issues.push({ path: ["lines"], message: SUBTOTAL_MESSAGE });
  }
  return issues;
}

export const draftSchema = z
  .object({ bill_to: z.string(), lines: z.array(z.custom<DraftLineValues>()) })
  .superRefine((values, context) => {
    for (const { path, message } of draftProblems(values)) context.addIssue({ code: "custom", path, message });
  });

const COMPANY_DETAILS: [keyof CompanySettings, string][] = [
  ["company_name", "company name"],
  ["address", "address"],
  ["email", "email"],
  ["phone", "phone"],
  ["tax_label", "tax label"],
];

/** What only issuing needs (V10), beside its field, or under "form" for the draft as a whole, as the backend gives them. */
export function issueProblems(values: DraftValues, invoice: InvoiceDetail, settings: CompanySettings) {
  const fields: Record<string, string> = {};
  if (!values.bill_to.trim()) fields.bill_to = BILL_TO_BLANK;
  if (values.lines.length === 0) fields.lines = NO_LINES;
  const total = totals(typedLines(values.lines), settings.tax_rate).total_cents;
  if (values.lines.length > 0 && total === 0) fields.form = NOTHING_TO_PAY;
  else if (invoice.organization === null) fields.form = NO_ORGANIZATION;
  else if (!settings.company_name) fields.form = NO_COMPANY_NAME;
  else {
    for (const [field, words] of COMPANY_DETAILS) {
      const found = unprintable(settings[field] as string | null);
      if (found.length) {
        fields.form = companyMessage(words, found);
        break;
      }
    }
  }
  return fields;
}

function errorAt(errors: unknown, path: (string | number)[]): string | undefined {
  let found: unknown = errors;
  for (const part of path) found = (found as Record<string | number, unknown> | undefined)?.[part];
  return (found as FieldError | undefined)?.message;
}

/** The panel's heading names the box, so it has no label of its own to say it twice. */
function BillTo() {
  const {
    register,
    formState: { errors },
  } = useFormContext<DraftValues>();
  const error = errors.bill_to?.message;
  return (
    <SidePanel title="Bill to">
      <div className="flex flex-col gap-1">
        <textarea
          id="draft-bill-to"
          rows={6}
          aria-label="Bill to"
          className="input min-h-[140px]"
          aria-invalid={!!error}
          aria-describedby={error ? messageId("draft-bill-to") : undefined}
          {...register("bill_to")}
        />
        {error && (
          <p id={messageId("draft-bill-to")} role="alert" className="text-[13px] leading-[18px] text-raspberry-text">
            {error}
          </p>
        )}
      </div>
    </SidePanel>
  );
}

function LineCard({ place, onRemove }: { place: number; onRemove: () => void }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<DraftValues>();
  const line = useWatch<DraftValues, `lines.${number}`>({ name: `lines.${place}` });
  const [typed] = typedLines([line]);
  const box = (field: string) => `draft-line-${place}-${field}`;
  const error = (field: string) => errorAt(errors, ["lines", place, field]);
  // The name can't be changed here, so a refusal of it, or of an archived product, shows under it.
  const nameError = error("name") ?? error("product_id");
  return (
    <li className="flex flex-col gap-2 rounded-card bg-page p-3" data-testid="draft-line">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold break-words">{line.name}</span>
        <button
          type="button"
          className="icon-btn -mt-1 -mr-1 flex-none"
          aria-label={`Remove ${line.name}`}
          onClick={onRemove}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {nameError && (
        <p role="alert" className="text-[13px] leading-[18px] text-raspberry-text">
          {nameError}
        </p>
      )}
      <Field label="Description" htmlFor={box("description")} error={error("description")}>
        <textarea
          id={box("description")}
          rows={2}
          className="input bg-panel"
          {...register(`lines.${place}.description`)}
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] items-start gap-2">
        <Field label="Quantity" htmlFor={box("quantity")} error={error("quantity")}>
          <input
            id={box("quantity")}
            className="input bg-panel"
            inputMode="numeric"
            {...register(`lines.${place}.quantity`)}
          />
        </Field>
        <Field label="Unit price" htmlFor={box("unit-price")} error={error("unit_price_cents")}>
          <input
            id={box("unit-price")}
            className="input bg-panel"
            inputMode="decimal"
            {...register(`lines.${place}.unit_price_cents`)}
          />
        </Field>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-[13px] leading-[18px] font-semibold">Amount</span>
          <span className="num flex h-[38px] items-center justify-end text-[13px]" data-testid="line-amount">
            {price(typed.quantity * typed.unit_price_cents)}
          </span>
        </div>
      </div>
    </li>
  );
}

/** A secondary button that opens a searchable list of active products (V6). */
function AddLine({ onAdd }: { onAdd: (line: DraftLineValues) => void }) {
  const products = useProducts();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const active = useMemo(() => (products.data ?? []).filter((product) => product.active), [products.data]);
  const wanted = search.trim().toLowerCase();
  const matches = active.filter((product) => product.name.toLowerCase().includes(wanted)).slice(0, 50);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="btn btn-secondary self-start" aria-haspopup="listbox">
          <Plus size={15} aria-hidden="true" />
          Add line
        </button>
      </Popover.Trigger>
      <Popover.Content
        align="start"
        sideOffset={4}
        className="z-50 w-[380px] rounded-card bg-raised p-1.5 shadow-(--shadow-popover)"
      >
        <Command shouldFilter={false} label="Products">
          <Command.Input value={search} onValueChange={setSearch} placeholder="Search products" className="input h-9" />
          <Command.List className="mt-1 max-h-[260px] overflow-y-auto">
            {matches.map((product) => (
              <Command.Item
                key={product.id}
                value={String(product.id)}
                onSelect={() => {
                  onAdd({
                    id: null,
                    product_id: product.id,
                    name: product.name,
                    description: product.description ?? "",
                    quantity: "1",
                    unit_price_cents: priceText(product.unit_price_cents),
                  });
                  setOpen(false);
                  setSearch("");
                }}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 data-[selected=true]:bg-page"
              >
                <span className="min-w-0 truncate">{product.name}</span>
                <span className="num flex-none text-[13px] text-muted">{price(product.unit_price_cents)}</span>
              </Command.Item>
            ))}
            {matches.length === 0 && (
              <p className="px-2.5 py-1.5 text-[13px] text-muted">
                {products.data ? "No active products match." : "Loading products"}
              </p>
            )}
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover.Root>
  );
}

function Figures({ rate, label }: { rate: string; label: string | null }) {
  const lines = useWatch<DraftValues, "lines">({ name: "lines" });
  const figures = totals(typedLines(lines), rate);
  const rows: [string, number, boolean][] = [
    ["Subtotal", figures.subtotal_cents, false],
    [`${label || "Tax"} (${rate}%)`, figures.tax_cents, false],
    ["Total", figures.total_cents, true],
  ];
  return (
    <dl className="mt-3 flex flex-col items-end gap-1" data-testid="draft-figures">
      {rows.map(([name, cents, isTotal]) => (
        <div key={name} className={`flex gap-6 ${isTotal ? "font-semibold" : ""}`}>
          <dt className={isTotal ? "" : "text-muted"}>{name}</dt>
          <dd className="num min-w-[120px] text-right">{price(cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The draft's form (V5 to V9): the Bill to, then the lines with Add line and the figures as they're typed. */
export function DraftForm({ invoice }: { invoice: InvoiceDetail }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<DraftValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lines", keyName: "key" });
  const linesError = errors.lines?.message ?? errors.lines?.root?.message;
  return (
    <>
      <BillTo />
      <SidePanel title="Lines">
        {fields.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {fields.map((field, place) => (
              <LineCard key={field.key} place={place} onRemove={() => remove(place)} />
            ))}
          </ul>
        )}
        <AddLine onAdd={(line) => append(line)} />
        {linesError && (
          <p role="alert" className="mt-2 text-[13px] leading-[18px] text-raspberry-text">
            {linesError}
          </p>
        )}
        <Figures rate={invoice.tax_rate} label={invoice.tax_label} />
      </SidePanel>
    </>
  );
}
