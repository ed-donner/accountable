import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { Stage } from "../crm/queries";
import { api } from "../lib/api";
import { useDeleteRecord, useWrite, type Authorship, type Person } from "../lib/records";
import { useToday } from "../lib/useToday";

/** What an invoice shows as, worked out by the backend from its own today (V3). */
export type ShowsAs = "draft" | "issued" | "part_paid" | "overdue" | "paid" | "void";
export type Method = "bank_transfer" | "card" | "check" | "cash" | "other";

type Named = { id: number; name: string };

/** An invoice in a list, and the start of every invoice reply. A draft has no number or dates. */
export type InvoiceRow = {
  id: number;
  number: string | null;
  shows_as: ShowsAs;
  deal: Named;
  /** A draft's is its deal's, and an issued invoice's the one it was issued to. */
  organization: Named | null;
  bill_to: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  owed_cents: number;
};

export type InvoiceLine = {
  id: number;
  product_id: number;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
};

export type Payment = {
  id: number;
  paid_on: string;
  amount_cents: number;
  method: Method;
  reference: string | null;
  created_at: string;
  created_by: Person | null;
};

/** For a draft, the company and the tax are the settings as they are now. For an issued invoice, its copies (V11). */
export type InvoiceDetail = InvoiceRow &
  Authorship & {
    status: "draft" | "issued" | "void";
    days_late: number | null;
    deal_stage: Stage;
    company: { name: string | null; address: string | null; email: string | null; phone: string | null };
    tax_label: string | null;
    /** As text, such as "8.875" (B7). */
    tax_rate: string;
    lines: InvoiceLine[];
    subtotal_cents: number;
    tax_cents: number;
    paid_cents: number;
    payments: Payment[];
    issued_by: Person | null;
    voided_by: Person | null;
    voided_at: string | null;
  };

export type MoneySum = { cents: number; count: number };
export type LateGroup = "not_due" | "1_30" | "31_60" | "61_90" | "over_90";
export type Money = {
  owed: MoneySum;
  overdue: MoneySum;
  groups: (MoneySum & { key: LateGroup })[];
  payments: (MoneySum & { month: string; label: string })[];
};

/** What Save draft and Issue invoice send: the Bill to and the whole list of lines, in order. */
export type DraftRequest = {
  bill_to: string | null;
  lines: {
    id?: number;
    product_id: number;
    description: string | null;
    quantity: number;
    unit_price_cents: number;
  }[];
};

export type PaymentRequest = { paid_on: string; amount_cents: number; method: Method; reference: string | null };

/** A deal's or an organization's invoices, for its panel, or every invoice. */
export type InvoiceFilter = { deal_id: number } | { organization_id: number } | undefined;

function filterQuery(filter: InvoiceFilter) {
  if (filter === undefined) return "";
  const [[name, value]] = Object.entries(filter);
  return `?${name}=${value}`;
}

// What an invoice shows as moves on with the days, so each read is keyed by today, and a
// page left open overnight reads again on its own (V31).

export function useInvoices(filter?: InvoiceFilter) {
  const today = useToday();
  return useQuery({
    queryKey: ["invoices", "list", filter ?? null, today],
    queryFn: () => api<InvoiceRow[]>(`/invoices${filterQuery(filter)}`),
  });
}

export function useInvoice(id: number) {
  const today = useToday();
  return useQuery({ queryKey: ["invoices", id, today], queryFn: () => api<InvoiceDetail>(`/invoices/${id}`) });
}

export function useMoney() {
  const today = useToday();
  return useQuery({ queryKey: ["invoices", "money", today], queryFn: () => api<Money>("/invoices/money") });
}

/** A write whose reply is the invoice, shown at once, before everything is read again. */
function useInvoiceWrite<Input>(id: number, write: (input: Input) => Promise<InvoiceDetail>) {
  const client = useQueryClient();
  const today = useToday();
  return useWrite(async (input: Input) => {
    const saved = await write(input);
    client.setQueryData(["invoices", id, today], saved);
    return saved;
  });
}

export function useStartInvoice() {
  return useWrite((dealId: number) => api<InvoiceDetail>("/invoices", { method: "POST", body: { deal_id: dealId } }));
}

export function useSaveDraft(id: number) {
  return useInvoiceWrite(id, (draft: DraftRequest) =>
    api<InvoiceDetail>(`/invoices/${id}`, { method: "PATCH", body: draft }),
  );
}

export function useIssue(id: number) {
  return useInvoiceWrite(id, (draft: DraftRequest) =>
    api<InvoiceDetail>(`/invoices/${id}/issue`, { method: "POST", body: draft }),
  );
}

export function useVoid(id: number) {
  return useInvoiceWrite(id, () => api<InvoiceDetail>(`/invoices/${id}/void`, { method: "POST", body: {} }));
}

export function useDeleteDraft(id: number) {
  return useDeleteRecord("invoices", id);
}

export function useRecordPayment(id: number) {
  return useInvoiceWrite(id, (payment: PaymentRequest) =>
    api<InvoiceDetail>(`/invoices/${id}/payments`, { method: "POST", body: payment }),
  );
}

export function useDeletePayment(id: number) {
  return useInvoiceWrite(id, (paymentId: number) =>
    api<InvoiceDetail>(`/invoices/${id}/payments/${paymentId}`, { method: "DELETE" }),
  );
}
