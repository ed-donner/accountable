import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { api, fetchFile } from "../lib/api";
import { base64Of } from "../lib/files";
import { useWrite, type Person } from "../lib/records";
import { EMAIL_MESSAGE, isEmail } from "../lib/validate";
import { accentProblem, keptAccent } from "./accent";

export type InvoiceDesign = "classic" | "banner" | "ledger";
export const DESIGNS: { key: InvoiceDesign; name: string }[] = [
  { key: "classic", name: "Classic" },
  { key: "banner", name: "Banner" },
  { key: "ledger", name: "Ledger" },
];

/** The logo's checked type and size. Its bytes come from GET /settings/logo (B22). */
export type SavedLogo = { media_type: string; width: number; height: number };

/** The company settings (B1), as GET and PATCH /settings reply. The rate is text, such as "8.875" (B7). */
export type CompanySettings = {
  company_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  tax_label: string | null;
  tax_rate: string;
  payment_terms_days: number;
  quote_prefix: string;
  invoice_prefix: string;
  invoice_design: InvoiceDesign;
  accent_color: string;
  logo: SavedLogo | null;
  updated_at: string;
  /** Nobody, until someone saves them (B9, B13). */
  updated_by: Person | null;
};

/** The logo goes as base64 text, or null to remove it, and is left out to keep it. */
export type SettingsRequest = Omit<CompanySettings, "updated_at" | "updated_by" | "logo"> & { logo?: string | null };

const SETTINGS_KEY = ["settings"];

export function useCompanySettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<CompanySettings>("/settings") });
}

/**
 * The saved logo as an address an image can show, read with the token. It's a data address,
 * so there's nothing to let go of afterwards. Read again whenever the settings change.
 */
export function useSavedLogo(settings: CompanySettings | undefined) {
  const query = useQuery({
    queryKey: [...SETTINGS_KEY, "logo", settings?.updated_at],
    queryFn: async () => {
      const file = await fetchFile("/settings/logo");
      return `data:${file.type};base64,${await base64Of(file)}`;
    },
    enabled: Boolean(settings?.logo),
    staleTime: Infinity,
  });
  return settings?.logo ? (query.data ?? null) : null;
}

/** Saves the whole form. The reply shows at once, before everything is read again. */
export function useSaveSettings() {
  const client = useQueryClient();
  return useWrite(async (values: SettingsRequest) => {
    const saved = await api<CompanySettings>("/settings", { method: "PATCH", body: values });
    client.setQueryData(SETTINGS_KEY, saved);
    return saved;
  });
}

// The backend checks the same rules, from the same cases in shared/settings-cases.json, and has the last word (B5).

export const COMPANY_NAME_MESSAGE = "Enter the company name";
export const RATE_RANGE_MESSAGE = "Enter a rate from 0 to 100%";
export const RATE_DECIMALS_MESSAGE = "Use at most three decimal places";
export const PAYMENT_TERMS_MESSAGE = "Enter a whole number of days from 0 to 365";
export const QUOTE_PREFIX_BLANK_MESSAGE = "Enter a prefix, such as QT-";
export const INVOICE_PREFIX_BLANK_MESSAGE = "Enter a prefix, such as INV-";
export const PREFIX_CHARACTERS_MESSAGE = "Use up to 10 letters, digits and hyphens";
export const CLASH_MESSAGE = "Clashes with the quote prefix. Neither can start with the other, ignoring capitals";

// Digits with an optional point, and at least one digit: 8.875, 8, .5 or 5.
const RATE_DIGITS = /^(?=\.?\d)(\d*)(?:\.(\d*))?$/;
const MAX_DECIMAL_PLACES = 3;
const PREFIX = /^[A-Za-z0-9-]{1,10}$/;
const MAX_PAYMENT_TERMS = 365;

/**
 * What's wrong with a typed tax rate, if anything. It's read from the digits, never
 * through Number(), so 8.875 can't become a binary fraction on the way (B7).
 */
export function taxRateProblem(text: string): string | undefined {
  const match = RATE_DIGITS.exec(text.trim());
  if (!match) return RATE_RANGE_MESSAGE;
  const whole = match[1].replace(/^0+/, "");
  const places = (match[2] ?? "").replace(/0+$/, "");
  // Up to two digits is under 100, and the only rate with three is exactly 100.
  const inRange = whole.length < 3 || (whole === "100" && places === "");
  if (!inRange) return RATE_RANGE_MESSAGE;
  if (places.length > MAX_DECIMAL_PLACES) return RATE_DECIMALS_MESSAGE;
  return undefined;
}

export function paymentTermsProblem(text: string): string | undefined {
  const days = text.trim();
  return /^\d{1,3}$/.test(days) && Number(days) <= MAX_PAYMENT_TERMS ? undefined : PAYMENT_TERMS_MESSAGE;
}

export function prefixProblem(text: string, blankMessage: string): string | undefined {
  const prefix = text.trim();
  if (prefix === "") return blankMessage;
  return PREFIX.test(prefix) ? undefined : PREFIX_CHARACTERS_MESSAGE;
}

/** Whether a quote's number and an invoice's could ever be the same (B6). */
export function prefixesClash(quote: string, invoice: string): boolean {
  const [q, i] = [quote.trim().toLowerCase(), invoice.trim().toLowerCase()];
  return q.startsWith(i) || i.startsWith(q);
}

/**
 * The logo as the form has it: kept as saved, a new file chosen, or removed. Only a new
 * one or a removal is sent (B18, B21). A new one's size is null if the browser can't read it.
 */
export type LogoChoice =
  | { kind: "kept" }
  | { kind: "removed" }
  | { kind: "new"; name: string; base64: string; url: string; size: { width: number; height: number } | null };

/** The form's boxes, all text as typed, so nothing is rounded or reformatted while it's edited. */
export type SettingsValues = {
  company_name: string;
  address: string;
  email: string;
  phone: string;
  tax_label: string;
  tax_rate: string;
  payment_terms_days: string;
  quote_prefix: string;
  invoice_prefix: string;
  invoice_design: InvoiceDesign;
  accent_color: string;
  logo: LogoChoice;
};

type Problems = Partial<Record<keyof SettingsValues, string>>;

/** Every field's message at once, the clash included, as the backend would give them (B4 to B6). */
export function settingsProblems(values: SettingsValues): Problems {
  const email = values.email.trim();
  const problems: Problems = {
    company_name: values.company_name.trim() === "" ? COMPANY_NAME_MESSAGE : undefined,
    email: email === "" || isEmail(email) ? undefined : EMAIL_MESSAGE,
    tax_rate: taxRateProblem(values.tax_rate),
    payment_terms_days: paymentTermsProblem(values.payment_terms_days),
    quote_prefix: prefixProblem(values.quote_prefix, QUOTE_PREFIX_BLANK_MESSAGE),
    invoice_prefix: prefixProblem(values.invoice_prefix, INVOICE_PREFIX_BLANK_MESSAGE),
    accent_color: accentProblem(values.accent_color),
  };
  const bothFine = !problems.quote_prefix && !problems.invoice_prefix;
  if (bothFine && prefixesClash(values.quote_prefix, values.invoice_prefix)) problems.invoice_prefix = CLASH_MESSAGE;
  return problems;
}

export const settingsSchema = z
  .object({
    company_name: z.string(),
    address: z.string(),
    email: z.string(),
    phone: z.string(),
    tax_label: z.string(),
    tax_rate: z.string(),
    payment_terms_days: z.string(),
    quote_prefix: z.string(),
    invoice_prefix: z.string(),
    invoice_design: z.enum(["classic", "banner", "ledger"]),
    accent_color: z.string(),
    logo: z.custom<LogoChoice>(),
  })
  .superRefine((values, context) => {
    for (const [field, message] of Object.entries(settingsProblems(values))) {
      if (message) context.addIssue({ code: "custom", path: [field], message });
    }
  });

export function toForm(settings: CompanySettings): SettingsValues {
  return {
    company_name: settings.company_name ?? "",
    address: settings.address ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    tax_label: settings.tax_label ?? "",
    tax_rate: settings.tax_rate,
    payment_terms_days: String(settings.payment_terms_days),
    quote_prefix: settings.quote_prefix,
    invoice_prefix: settings.invoice_prefix,
    invoice_design: settings.invoice_design,
    accent_color: settings.accent_color,
    logo: { kind: "kept" },
  };
}

function blankToNull(text: string): string | null {
  return text.trim() || null;
}

/** The rate goes as the typed text, so it reaches the backend exactly as typed (B7). */
export function toRequest(values: SettingsValues): SettingsRequest {
  return {
    company_name: values.company_name.trim(),
    address: blankToNull(values.address),
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
    tax_label: blankToNull(values.tax_label),
    tax_rate: values.tax_rate.trim(),
    payment_terms_days: Number(values.payment_terms_days.trim()),
    quote_prefix: values.quote_prefix.trim(),
    invoice_prefix: values.invoice_prefix.trim(),
    invoice_design: values.invoice_design,
    accent_color: keptAccent(values.accent_color),
    ...logoRequest(values.logo),
  };
}

/** Only a change to the logo is sent, so a save of the other settings never sends its bytes again. */
function logoRequest(logo: LogoChoice): Pick<SettingsRequest, "logo"> {
  if (logo.kind === "new") return { logo: logo.base64 };
  if (logo.kind === "removed") return { logo: null };
  return {};
}
