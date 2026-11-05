import type { ComponentType } from "react";

import type { InvoiceDesign } from "./settings";

/**
 * How a document looks with the settings as they are on the page, unsaved changes included,
 * for the Documents panel's sample (B19). The invoices area draws it, and App.tsx hands its
 * drawing to the page, so company/ never names invoices/.
 */
export type SampleLook = {
  design: InvoiceDesign;
  /** A color the accent check accepts, or the saved one while a typed one doesn't pass. */
  accent: string;
  logo: { url: string; width: number; height: number } | null;
  company: { name: string; address: string; email: string; phone: string };
  taxLabel: string;
  /** A rate the check accepts, such as "8.875". */
  taxRate: string;
  invoicePrefix: string;
  paymentTermsDays: number;
};

export type DocumentPreview = ComponentType<{ look: SampleLook }>;
