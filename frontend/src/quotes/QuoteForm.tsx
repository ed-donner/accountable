import { zodResolver } from "@hookform/resolvers/zod";
import { Command } from "cmdk";
import { Plus, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useFieldArray, useForm, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import { z } from "zod";

import {
  MAX_SUBTOTAL_CENTS,
  QUANTITY_MESSAGE,
  SUBTOTAL_MESSAGE,
  lineAmount,
  parseQuantity,
  totals,
} from "../company/tax";
import { Field, messageId } from "../components/Field";
import { parsePrice, price, priceText } from "../lib/money";
import { useProducts, type Product } from "../products/queries";
import type { Company, PreparedFor, QuoteLine, QuoteRequest } from "./queries";
import { QuoteDocument, type DocumentLine } from "./QuoteDocument";

const MAX_LINES = 100;
const LINES_MESSAGE = `Keep the quote to ${MAX_LINES} lines or fewer`;
const PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50";
const DATE_MESSAGE = "Choose a valid-until date";
const BEFORE_THE_QUOTE_DATE = "Choose a date on or after the quote's date";
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A line as the form holds it. Its boxes are named as the API's fields are, so a save's error for
 * lines.2.quantity lands beside that line's Quantity. key stays with the line while it's on the
 * page, so a line added while a save was on its way can be told from one the save added.
 */
export type LineValues = {
  key: string;
  line_id: number | null;
  product_id: number;
  name: string;
  description: string;
  quantity: string;
  unit_price_cents: string;
};

export type QuoteValues = { valid_until: string; lines: LineValues[] };

let lastKey = 0;
function newKey() {
  lastKey += 1;
  return `line-${lastKey}`;
}

/** What the boxes would add up to, with any box that isn't a number yet counting as nothing. */
function typedLines(lines: LineValues[]) {
  return lines.map((line) => {
    const quantity = parseQuantity(line.quantity) ?? 0;
    const unitPrice = parsePrice(line.unit_price_cents) ?? 0;
    return {
      quantity,
      unit_price_cents: unitPrice,
      amount_cents: lineAmount({ quantity, unit_price_cents: unitPrice }),
    };
  });
}

/** The page's checks, the same as the backend's, which has the last word (Q13, Q14). */
function schemaFor(quoteDate: string) {
  const line = z.object({
    key: z.string(),
    line_id: z.number().nullable(),
    product_id: z.number(),
    name: z.string(),
    description: z.string(),
    quantity: z.string().refine((text) => parseQuantity(text) !== null, QUANTITY_MESSAGE),
    unit_price_cents: z.string().refine((text) => parsePrice(text) !== null, PRICE_MESSAGE),
  });
  return z
    .object({
      valid_until: z
        .string()
        .refine((text) => PLAIN_DATE.test(text), DATE_MESSAGE)
        .refine((text) => text >= quoteDate, BEFORE_THE_QUOTE_DATE),
      lines: z.array(line).max(MAX_LINES, LINES_MESSAGE),
    })
    .refine((values) => totals(typedLines(values.lines), "0").subtotal_cents <= MAX_SUBTOTAL_CENTS, {
      path: ["lines"],
      message: SUBTOTAL_MESSAGE,
    });
}

/** The quote as the form holds it. The keys given go to its lines in turn, so they stay with the lines a save sent. */
export function toForm(quote: { valid_until: string; lines: QuoteLine[] }, keys: string[] = []): QuoteValues {
  return {
    valid_until: quote.valid_until,
    lines: quote.lines.map((line, index) => ({
      key: keys[index] ?? newKey(),
      line_id: line.id,
      product_id: line.product_id,
      name: line.name,
      description: line.description ?? "",
      quantity: String(line.quantity),
      unit_price_cents: priceText(line.unit_price_cents),
    })),
  };
}

/** A save's body: lines already on the quote by their ids, new ones by their products, and no amounts (Q15). */
export function toRequest(values: QuoteValues): QuoteRequest {
  return {
    valid_until: values.valid_until,
    lines: values.lines.map((line) => {
      const typed = {
        description: line.description.trim() || null,
        quantity: parseQuantity(line.quantity)!,
        unit_price_cents: parsePrice(line.unit_price_cents)!,
      };
      return line.line_id === null ? { product_id: line.product_id, ...typed } : { id: line.line_id, ...typed };
    }),
  };
}

type Saved = { valid_until: string; lines: QuoteLine[] };

/** What a reply holds that the form shows, to tell a newer reply from the same one read again. */
function contentOf(quote: Saved) {
  return JSON.stringify([quote.valid_until, quote.lines]);
}

/**
 * Taking a reply redraws the lines' boxes, so the box being typed in gets its focus back, with the
 * caret where it was. The boxes are named by their places, which a save doesn't change.
 */
function keepingFocus(take: () => void) {
  const focused = document.activeElement;
  take();
  if (!(focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) || !focused.id) return;
  const { id, selectionStart, selectionEnd } = focused;
  setTimeout(() => {
    const box = document.getElementById(id);
    if (!(box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) || box === document.activeElement)
      return;
    box.focus();
    if (box.type !== "date") box.setSelectionRange(selectionStart, selectionEnd);
  });
}

/**
 * The form for a draft. A newer reply, such as a teammate's save, fills it only while nothing has
 * been typed since it was filled or saved, as on the Company settings page (Q19, B10). takeSaved
 * fills it from the page's own save.
 */
export function useQuoteForm(quote: Saved, quoteDate: string) {
  const schema = useMemo(() => schemaFor(quoteDate), [quoteDate]);
  const form = useForm<QuoteValues>({ resolver: zodResolver(schema), defaultValues: toForm(quote) });
  const shown = useRef(contentOf(quote));
  const { isDirty } = form.formState;
  const { reset } = form;

  useEffect(() => {
    const content = contentOf(quote);
    if (isDirty || content === shown.current) return;
    shown.current = content;
    keepingFocus(() => reset(toForm(quote)));
  }, [quote, isDirty, reset]);

  /**
   * After a save, the form takes the saved quote. Anything typed while the save was on its way
   * stays, still to be saved, and a line the save added keeps its box with the id it now has.
   */
  const takeSaved = useCallback(
    (sent: QuoteValues, saved: Saved) => {
      shown.current = contentOf(saved);
      // A copy, because getValues() shares the lines with the form, which the reset below replaces.
      const typed = structuredClone(form.getValues());
      keepingFocus(() => {
        form.reset(
          toForm(
            saved,
            sent.lines.map((line) => line.key),
          ),
        );
        if (JSON.stringify(typed) === JSON.stringify(sent)) return;
        const ids = new Map(sent.lines.map((line, index) => [line.key, saved.lines[index]?.id ?? null]));
        form.setValue("valid_until", typed.valid_until, { shouldDirty: true });
        form.setValue(
          "lines",
          typed.lines.map((line) => ({ ...line, line_id: line.line_id ?? ids.get(line.key) ?? null })),
          { shouldDirty: true },
        );
      });
    },
    [form],
  );

  return { form, takeSaved };
}

/** A new line from the price list, as Q11 has it: its name, description and price, and a quantity of 1. */
function lineFrom(product: Product): LineValues {
  return {
    key: newKey(),
    line_id: null,
    product_id: product.id,
    name: product.name,
    description: product.description ?? "",
    quantity: "1",
    unit_price_cents: priceText(product.unit_price_cents),
  };
}

type FormProps = {
  form: UseFormReturn<QuoteValues>;
  /** The id the page's Save quote button names, so Enter in a one-line box saves too. */
  id: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

/** A draft's form: its valid-until date and its lines (Q11 to Q14). */
export function QuoteForm({ form, id, onSubmit }: FormProps) {
  const { register, control, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const errors = formState.errors;
  const linesError = errors.lines?.message ?? errors.lines?.root?.message;

  return (
    <form id={id} noValidate onSubmit={onSubmit} className="panel flex flex-col gap-3 px-[18px] py-4">
      <Field label="Valid until" htmlFor="quote-valid-until" error={errors.valid_until?.message}>
        <input
          id="quote-valid-until"
          type="date"
          className="input num w-48"
          aria-invalid={!!errors.valid_until}
          aria-describedby={errors.valid_until ? messageId("quote-valid-until") : undefined}
          {...register("valid_until")}
        />
      </Field>
      <h2 className="mt-1">Lines</h2>
      {fields.length === 0 && <p className="text-muted">No lines yet. Add a product from the price list.</p>}
      <ol className="flex flex-col gap-5">
        {fields.map((field, index) => (
          <LineBoxes key={field.id} form={form} index={index} name={field.name} onRemove={() => remove(index)} />
        ))}
      </ol>
      {linesError && (
        <p role="alert" className="text-[13px] leading-[18px] text-raspberry-text">
          {linesError}
        </p>
      )}
      <AddProduct onAdd={(product) => append(lineFrom(product))} />
    </form>
  );
}

type LineBoxesProps = { form: UseFormReturn<QuoteValues>; index: number; name: string; onRemove: () => void };

function LineBoxes({ form, index, name, onRemove }: LineBoxesProps) {
  const { register, control } = form;
  const errors = form.formState.errors.lines?.[index];
  const box = `quote-line-${index}`;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 pt-1.5 font-semibold break-words">{name}</p>
        <button type="button" className="icon-btn flex-none" aria-label={`Remove ${name}`} onClick={onRemove}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <Field label="Description" htmlFor={`${box}-description`} error={errors?.description?.message}>
        <textarea
          id={`${box}-description`}
          rows={2}
          className="input min-h-[58px] field-sizing-content"
          {...register(`lines.${index}.description`)}
        />
      </Field>
      <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-start gap-3">
        <Field label="Quantity" htmlFor={`${box}-quantity`} error={errors?.quantity?.message}>
          <input
            id={`${box}-quantity`}
            inputMode="numeric"
            className="input num"
            aria-invalid={!!errors?.quantity}
            aria-describedby={errors?.quantity ? messageId(`${box}-quantity`) : undefined}
            {...register(`lines.${index}.quantity`)}
          />
        </Field>
        <Field label="Unit price" htmlFor={`${box}-price`} error={errors?.unit_price_cents?.message}>
          <div className="relative">
            <span aria-hidden="true" className="num pointer-events-none absolute top-[9px] left-3 text-muted">
              $
            </span>
            <input
              id={`${box}-price`}
              inputMode="decimal"
              className="input num pl-7"
              aria-invalid={!!errors?.unit_price_cents}
              aria-describedby={errors?.unit_price_cents ? messageId(`${box}-price`) : undefined}
              {...register(`lines.${index}.unit_price_cents`)}
            />
          </div>
        </Field>
        <LineAmount control={control} index={index} />
      </div>
    </li>
  );
}

/** The line's amount as typed, worked out as the backend will (B16). */
function LineAmount({ control, index }: { control: Control<QuoteValues>; index: number }) {
  const [quantity, unitPrice] = useWatch({
    control,
    name: [`lines.${index}.quantity`, `lines.${index}.unit_price_cents`],
  });
  const amount = lineAmount({ quantity: parseQuantity(quantity) ?? 0, unit_price_cents: parsePrice(unitPrice) ?? 0 });
  return (
    <div className="flex flex-col gap-1 text-right">
      <span className="text-[13px] leading-[18px] font-semibold">Amount</span>
      <span className="num leading-[38px]">{price(amount)}</span>
    </div>
  );
}

/** A searchable list of the active products, each with its price, built as the record pickers are (Q11). */
function AddProduct({ onAdd }: { onAdd: (product: Product) => void }) {
  const products = useProducts();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();

  const matches = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    const active = (products.data ?? []).filter((product) => product.active);
    return wanted ? active.filter((product) => product.name.toLowerCase().includes(wanted)) : active;
  }, [products.data, search]);

  function choose(product: Product) {
    onAdd(product);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="btn btn-secondary self-start"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
        >
          <Plus size={15} aria-hidden="true" />
          Add product
        </button>
      </Popover.Trigger>
      <Popover.Content
        id={listId}
        align="start"
        sideOffset={4}
        className="z-50 w-[380px] rounded-card bg-raised p-1.5 shadow-(--shadow-popover)"
      >
        <Command shouldFilter={false} label="Add product">
          <Command.Input value={search} onValueChange={setSearch} placeholder="Search products" className="input h-9" />
          <Command.List className="mt-1 max-h-[260px] overflow-y-auto">
            {matches.map((product) => (
              <Command.Item
                key={product.id}
                value={String(product.id)}
                onSelect={() => choose(product)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 data-[selected=true]:bg-page"
              >
                <span className="min-w-0 truncate">{product.name}</span>
                <span className="num flex-none text-[13px] text-muted">{price(product.unit_price_cents)}</span>
              </Command.Item>
            ))}
            {products.data && matches.length === 0 && (
              <p className="px-2.5 py-1.5 text-[13px] text-muted">No active products match.</p>
            )}
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover.Root>
  );
}

type PreviewProps = {
  control: Control<QuoteValues>;
  number: string | null;
  quoteDate: string;
  company: Company;
  preparedFor: PreparedFor;
  taxLabel: string | null;
  taxRate: string;
};

/** The quote as the customer will see it, as it's typed: the boxes' lines and the sums from company/tax.ts (Q15). */
export function LivePreview({ control, ...quote }: PreviewProps) {
  const [lines, validUntil] = useWatch({ control, name: ["lines", "valid_until"] });
  const typed = typedLines(lines);
  const shown: DocumentLine[] = lines.map((line, index) => ({
    key: line.key,
    name: line.name,
    description: line.description.trim() ? line.description : null,
    ...typed[index],
  }));
  return (
    <QuoteDocument {...quote} draft validUntil={validUntil} lines={shown} figures={totals(typed, quote.taxRate)} />
  );
}
