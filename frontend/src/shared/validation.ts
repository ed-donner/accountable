// Field rules and plain messages for the forms (V1 to V3). The backend checks the
// same rules with the same messages (backend/app/schemas.py), so it has the last word (V4).
import { z } from "zod";

export const MESSAGES = {
  name: "Enter a name.",
  email: "Enter an email address like name@company.com.",
  website: "Enter a website like company.com.",
  organization_id: "Choose an organization.",
  stage: "Choose a stage.",
  status: "Choose lead, qualified or customer.",
  value: "Enter a value from 0 to 1,000,000,000, in whole dollars.",
  probability: "Enter a probability from 0 to 100.",
  type: "Choose note, call or email.",
  description: "Enter a description.",
  occurred_on: "Enter the date it happened.",
  follow_up_on: "Enter a follow-up date.",
  close_date: "Enter a close date.",
} as const;

// Same pattern as EMAIL_RE in schemas.py: domain parts have no dots inside them,
// so a long run of dots can't make the check slow.
export const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
export const WEBSITE_RE = /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i;

export function withHttps(website: string): string {
  const trimmed = website.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Size caps, the same as the backend's (RV10). */
export const NAME_MAX = 200;
export const TEXT_MAX = 10_000;
export const tooLong = (limit: number) =>
  `Keep this to ${limit.toLocaleString("en-US")} characters or fewer.`;

const required = (message: string, limit = NAME_MAX) =>
  z.string().trim().min(1, message).max(limit, tooLong(limit));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Date fields hold YYYY-MM-DD; anything else is a half-typed date. */
const optionalDate = (message: string) =>
  z.string().refine((v) => v === "" || ISO_DATE.test(v), message);
const requiredDate = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .refine((v) => ISO_DATE.test(v), message);
const optional = z.string().trim().max(TEXT_MAX, tooLong(TEXT_MAX));
/** A select holding a record id: no length to cap. */
const choice = z.string();
// Length first, as on the backend, so the format check only sees short text.
const email = z
  .string()
  .trim()
  .refine((v) => v.length <= NAME_MAX, {
    message: tooLong(NAME_MAX),
    abort: true,
  })
  .refine((v) => v === "" || EMAIL_RE.test(v), MESSAGES.email);
// The backend adds https:// before it checks the length, so this does too.
const website = z
  .string()
  .trim()
  .refine((v) => v === "" || WEBSITE_RE.test(withHttps(v)), MESSAGES.website)
  .refine((v) => withHttps(v).length <= NAME_MAX, tooLong(NAME_MAX));
/** The largest deal value; the backend has the same limit (RV1). */
export const MAX_VALUE = 1_000_000_000;
const wholeNumber = (max: number) => (v: string) => {
  const cleaned = v.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return false;
  return Number(cleaned) <= max;
};

export const organizationSchema = z.object({
  name: required(MESSAGES.name),
  website,
  industry: optional,
  notes: optional,
});
export type OrganizationValues = z.infer<typeof organizationSchema>;

export const contactSchema = z.object({
  name: required(MESSAGES.name),
  email,
  phone: optional,
  job_title: optional,
  organization_id: choice,
  status: z.enum(["lead", "qualified", "customer"], {
    message: MESSAGES.status,
  }),
});
export type ContactValues = z.infer<typeof contactSchema>;

/** Concern 1: the organization is required unless the deal has already lost it. */
export function dealSchema(organizationRequired: boolean) {
  return z.object({
    name: required(MESSAGES.name),
    organization_id: organizationRequired
      ? z.string().trim().min(1, MESSAGES.organization_id)
      : choice,
    contact_id: choice,
    stage: z.enum(["new", "qualified", "proposal", "negotiation", "won", "lost"], {
      message: MESSAGES.stage,
    }),
    value: z.string().trim().min(1, MESSAGES.value).refine(wholeNumber(MAX_VALUE), MESSAGES.value),
    probability: z
      .string()
      .trim()
      .refine((v) => v === "" || wholeNumber(100)(v), MESSAGES.probability),
    close_date: optionalDate(MESSAGES.close_date),
  });
}
export type DealValues = z.infer<ReturnType<typeof dealSchema>>;

export const activitySchema = z.object({
  type: z.enum(["note", "call", "email"], { message: MESSAGES.type }),
  description: required(MESSAGES.description, TEXT_MAX),
  occurred_on: requiredDate(MESSAGES.occurred_on),
  follow_up_on: optionalDate(MESSAGES.follow_up_on),
});
export type ActivityValues = z.infer<typeof activitySchema>;

/** The activity form also edits "done" (A1: only when there's a follow-up date). */
export const activityFormSchema = activitySchema.extend({ done: z.boolean() });
export type ActivityFormValues = z.infer<typeof activityFormSchema>;

/** "48,200" or "$48,200" to 48200. */
export function toWholeNumber(v: string): number {
  return Number(v.replace(/[$,\s]/g, ""));
}

/** "" to null, for optional fields sent to the backend. */
export function orNull(v: string): string | null {
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

export function idOrNull(v: string): number | null {
  return v === "" ? null : Number(v);
}
