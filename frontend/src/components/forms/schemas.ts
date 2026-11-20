import { z } from "zod";
import { STAGES, STATUSES } from "@/lib/rules";

// The spec's field rules and messages. They match backend/app/schemas.py, so a
// problem reads the same whichever side finds it.

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const EMAIL_MESSAGE = "Enter an email address, such as sarah@bluefin.example";
export const VALUE_MESSAGE = "Enter a whole number of dollars from $0 to $100,000,000.";
export const PROBABILITY_MESSAGE = "Enter a whole percent from 0 to 100.";

const tooLong = (max: number) => `Use ${max.toLocaleString("en-US")} characters or fewer.`;

const requiredText = (max: number, missing: string) => z.string().trim().min(1, missing).max(max, tooLong(max));
const optionalText = (max: number) => z.string().trim().max(max, tooLong(max));

/** A blank optional field is sent as null. */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Organizations

export function organizationSchema(existing: { id: number; name: string }[], currentId?: number) {
  return z
    .object({
      name: requiredText(120, "Enter a name."),
      website: optionalText(200),
      industry: optionalText(60),
      notes: optionalText(5000),
    })
    .superRefine((values, ctx) => {
      // Checked against the loaded list as you type (plan, decision 10).
      const taken = existing.find(
        (org) => org.id !== currentId && org.name.trim().toLowerCase() === values.name.trim().toLowerCase(),
      );
      if (taken) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: `An organization called ${taken.name} already exists.`,
        });
      }
    });
}

export type OrganizationValues = z.input<ReturnType<typeof organizationSchema>>;

// Contacts

export const contactSchema = z.object({
  name: requiredText(120, "Enter a name."),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), EMAIL_MESSAGE),
  phone: optionalText(40),
  job_title: optionalText(120),
  organization_id: z.number().int().nullable(),
  status: z.enum(STATUSES, { error: "Choose a status." }),
});

export type ContactValues = z.input<typeof contactSchema>;

// Deals

/** "48,500" or "$48,500" as 48500, or null if it isn't a whole number. */
export function toWholeNumber(text: string): number | null {
  const digits = text.replace(/[\s,$%]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

const wholeNumberText = (min: number, max: number, message: string) =>
  z.string().refine((value) => {
    const number = toWholeNumber(value);
    return number !== null && number >= min && number <= max;
  }, message);

export const dealSchema = z.object({
  name: requiredText(120, "Enter a name."),
  organization_id: z
    .number({ error: "Choose an organization." })
    .int()
    .nullable()
    .refine((id) => id !== null, "Choose an organization."),
  main_contact_id: z.number().int().nullable(),
  stage: z.enum(STAGES),
  value: wholeNumberText(0, 100_000_000, VALUE_MESSAGE),
  probability: wholeNumberText(0, 100, PROBABILITY_MESSAGE),
  close_date: z.string().min(1, "Enter a close date."),
});

export type DealValues = z.input<typeof dealSchema>;

// Activities

export const activitySchema = z.object({
  type: z.enum(["note", "call", "email"]),
  description: requiredText(5000, "Enter a description."),
  occurred_at: z.string().min(1, "Enter when it happened."),
  follow_up_date: z.string(),
});

export type ActivityValues = z.input<typeof activitySchema>;
