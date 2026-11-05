import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { Stage } from "../crm/queries";
import { api, download } from "../lib/api";
import { useWrite, type Authorship } from "../lib/records";

/** As saved. Expired is how a sent quote past its date shows, worked out on the page (Q7). */
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

/** The company's details on a quote: fixed once it's sent or declined, or the settings' on a draft (Q30). */
export type Company = { name: string | null; address: string | null; email: string | null; phone: string | null };
/** Who the quote is for: fixed once it's sent or declined, or the deal's on a draft (Q18). */
export type PreparedFor = { organization: string | null; contact: string | null; email: string | null };

export type QuoteLine = {
  id: number;
  product_id: number;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
};

/** A quote as its preview and PDF show it, every amount in whole cents. The rate is text, such as "8.875" (B7). */
export type QuoteDocument = {
  number: string;
  quote_date: string;
  valid_until: string;
  company: Company;
  prepared_for: PreparedFor;
  tax_label: string | null;
  tax_rate: string;
  lines: QuoteLine[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
};

export type DealLink = { id: number; name: string; stage: Stage };

export type QuoteDetail = QuoteDocument &
  Authorship & {
    id: number;
    status: QuoteStatus;
    deal: DealLink;
    sent_on: string | null;
    decided_on: string | null;
  };

/** What a new draft on a deal starts with, before its first save (Q8, Q9). */
export type NewQuote = Pick<QuoteDocument, "company" | "prepared_for" | "tax_label" | "tax_rate"> & { deal: DealLink };

export type QuoteRow = {
  id: number;
  number: string;
  status: QuoteStatus;
  deal_id: number;
  deal_name: string;
  deal_stage: Stage;
  organization_id: number | null;
  organization_name: string | null;
  quote_date: string;
  valid_until: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
};

/** What accepting changed, for the message after it (Q22). */
export type Accepted = {
  quote: QuoteDetail;
  deal: { id: number; name: string; value: number };
  changes: { close_date: string | null; new_customer: string | null; declined: string[] };
};

/** A line as a save sends it: one already on the quote by its id, or a new one by its product. */
export type LineRequest =
  | { id: number; description: string | null; quantity: number; unit_price_cents: number }
  | { product_id: number; description: string | null; quantity: number; unit_price_cents: number };

export type QuoteRequest = { valid_until: string; lines: LineRequest[] };

/** One deal's quotes, or those on one organization's deals, for the panels (Q36, Q37). */
export type QuoteFilter = { deal_id: number } | { organization_id: number };

function listPath(filter?: QuoteFilter) {
  if (!filter) return "/quotes";
  const [name, value] = Object.entries(filter)[0];
  return `/quotes?${name}=${value}`;
}

export function useQuotes(filter?: QuoteFilter) {
  return useQuery({ queryKey: ["quotes", filter ?? "all"], queryFn: () => api<QuoteRow[]>(listPath(filter)) });
}

export function useQuote(id: number) {
  return useQuery({ queryKey: ["quotes", id], queryFn: () => api<QuoteDetail>(`/quotes/${id}`) });
}

export function useNewQuote(dealId: number) {
  return useQuery({ queryKey: ["quotes", "new", dealId], queryFn: () => api<NewQuote>(`/quotes/new/${dealId}`) });
}

/** Adds a draft on the deal, or saves one. The reply shows at once, before everything is read again. */
export function useSaveQuote(target: { dealId: number } | { id: number }) {
  const client = useQueryClient();
  return useWrite(async (values: QuoteRequest) => {
    const saved =
      "id" in target
        ? await api<QuoteDetail>(`/quotes/${target.id}`, { method: "PATCH", body: values })
        : await api<QuoteDetail>("/quotes", { method: "POST", body: { deal_id: target.dealId, ...values } });
    client.setQueryData(["quotes", saved.id], saved);
    return saved;
  });
}

/**
 * Sending, accepting, declining or copying. They take no fields, and every POST has to be JSON.
 * The quote in the reply shows at once, before everything is read again.
 */
function useAction<Result>(action: "send" | "accept" | "decline" | "copy", quoteIn: (result: Result) => QuoteDetail) {
  const client = useQueryClient();
  return useWrite(async (id: number) => {
    const result = await api<Result>(`/quotes/${id}/${action}`, { method: "POST", body: {} });
    const quote = quoteIn(result);
    client.setQueryData(["quotes", quote.id], quote);
    return result;
  });
}

export function useSendQuote() {
  return useAction<QuoteDetail>("send", (quote) => quote);
}

export function useAcceptQuote() {
  return useAction<Accepted>("accept", (accepted) => accepted.quote);
}

export function useDeclineQuote() {
  return useAction<QuoteDetail>("decline", (quote) => quote);
}

export function useCopyQuote() {
  return useAction<QuoteDetail>("copy", (copy) => copy);
}

/** The PDF, made by the backend as the quote is saved now, named after its number (Q30). */
export function downloadQuote(quote: { id: number; number: string }) {
  return download(`/quotes/${quote.id}/pdf`, `${quote.number}.pdf`);
}
