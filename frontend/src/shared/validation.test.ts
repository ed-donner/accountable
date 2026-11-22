// TF11: required fields, email and website formats, plain messages.
import type { z } from "zod";
import { activitySchema, contactSchema, dealSchema, EMAIL_RE, MAX_VALUE, NAME_MAX, organizationSchema, TEXT_MAX, withHttps } from "./validation";

function errors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success) return {};
  return Object.fromEntries(result.error!.issues.map((i) => [String(i.path[0]), i.message]));
}

test("organization: name required, website checked", () => {
  expect(errors(organizationSchema.safeParse({ name: " ", website: "", industry: "", notes: "" }))).toEqual({
    name: "Enter a name.",
  });
  expect(errors(organizationSchema.safeParse({ name: "A", website: "acme", industry: "", notes: "" }))).toEqual({
    website: "Enter a website like company.com.",
  });
  expect(organizationSchema.safeParse({ name: "A", website: "acme.com", industry: "", notes: "" }).success).toBe(true);
  expect(withHttps("acme.com")).toBe("https://acme.com");
  expect(withHttps("http://acme.com")).toBe("http://acme.com");
});

test("contact: name required, email checked", () => {
  const base = { name: "Ada", email: "", phone: "", job_title: "", organization_id: "", status: "lead" };
  expect(contactSchema.safeParse(base).success).toBe(true);
  expect(errors(contactSchema.safeParse({ ...base, name: "", email: "ada@" }))).toEqual({
    name: "Enter a name.",
    email: "Enter an email address like name@company.com.",
  });
});

test("deal: name, organization, stage and value required; value whole and 0 or more", () => {
  const base = { name: "D", organization_id: "1", contact_id: "", stage: "new", value: "48,200", probability: "", close_date: "" };
  expect(dealSchema(true).safeParse(base).success).toBe(true);
  expect(errors(dealSchema(true).safeParse({ ...base, name: "", organization_id: "", value: "" }))).toEqual({
    name: "Enter a name.",
    organization_id: "Choose an organization.",
    value: "Enter a value from 0 to 1,000,000,000, in whole dollars.",
  });
  expect(errors(dealSchema(true).safeParse({ ...base, value: "-5" })).value).toBeDefined();
  expect(errors(dealSchema(true).safeParse({ ...base, value: "10.5" })).value).toBeDefined();
  expect(dealSchema(true).safeParse({ ...base, value: "1,000,000,000" }).success).toBe(true);
  expect(errors(dealSchema(true).safeParse({ ...base, value: "99999999999999999999" })).value).toBeDefined();
  expect(errors(dealSchema(true).safeParse({ ...base, probability: "101" }))).toEqual({
    probability: "Enter a probability from 0 to 100.",
  });
  // Concern 1: a deal that lost its organization can be saved without one.
  expect(dealSchema(false).safeParse({ ...base, organization_id: "" }).success).toBe(true);
});

test("activity: type, description and date required", () => {
  expect(errors(activitySchema.safeParse({ type: "", description: "", occurred_on: "", follow_up_on: "" }))).toEqual({
    type: "Choose note, call or email.",
    description: "Enter a description.",
    occurred_on: "Enter the date it happened.",
  });
});

test("half-typed dates are caught before saving", () => {
  const base = { type: "call", description: "x", occurred_on: "2026-11-16", follow_up_on: "" };
  expect(activitySchema.safeParse(base).success).toBe(true);
  expect(errors(activitySchema.safeParse({ ...base, follow_up_on: "112020-02-06" }))).toEqual({
    follow_up_on: "Enter a follow-up date.",
  });
});

// RV1 and RV10: the form refuses what the backend would, with the backend's own messages.
const deal = { name: "D", organization_id: "1", contact_id: "", stage: "new", value: "1", probability: "", close_date: "" };
const org = { name: "A", website: "", industry: "", notes: "" };
const person = { name: "Ada", email: "", phone: "", job_title: "", organization_id: "", status: "lead" };
const activity = { type: "call", description: "x", occurred_on: "2026-11-16", follow_up_on: "" };
const VALUE = "Enter a value from 0 to 1,000,000,000, in whole dollars.";
const PROBABILITY = "Enter a probability from 0 to 100.";

test.each(["0", "1000000000", "1,000,000,000", "$1,000,000,000", " 48 200 "])("value %s is accepted", (value) => {
  expect(dealSchema(true).safeParse({ ...deal, value }).success).toBe(true);
});

test.each(["-1", "1.5", "1000000001", "1,000,000,001", "99999999999999999999", "1e9", "Infinity", "NaN", "lots", "$"])(
  "value %s is refused",
  (value) => {
    expect(errors(dealSchema(true).safeParse({ ...deal, value }))).toEqual({ value: VALUE });
  },
);

test.each(["", "0", "100", "55"])("probability %j is accepted", (probability) => {
  expect(dealSchema(true).safeParse({ ...deal, probability }).success).toBe(true);
});

test.each(["-1", "101", "50.5", "1e2", "Infinity", "NaN", "half", "99999999999999999999"])(
  "probability %s is refused",
  (probability) => {
    expect(errors(dealSchema(true).safeParse({ ...deal, probability }))).toEqual({ probability: PROBABILITY });
  },
);

test("the value cap matches the backend's", () => {
  expect(MAX_VALUE).toBe(1_000_000_000);
});

const email = (n: number) => "a".repeat(n - "@b.com".length) + "@b.com";
const website = (n: number) => "a".repeat(n - "https://.com".length) + ".com"; // Typed without https://.

// [form, base values, field, limit, a valid value of length n]
type TextField = [form: string, schema: () => z.ZodType, base: object, field: string, limit: number, make: (n: number) => string];
const TEXT_FIELDS: TextField[] = [
  ["organization", () => organizationSchema, org, "name", NAME_MAX, (n) => "N".repeat(n)],
  ["organization", () => organizationSchema, org, "website", NAME_MAX, website],
  ["organization", () => organizationSchema, org, "industry", TEXT_MAX, (n) => "i".repeat(n)],
  ["organization", () => organizationSchema, org, "notes", TEXT_MAX, (n) => "n".repeat(n)],
  ["contact", () => contactSchema, person, "name", NAME_MAX, (n) => "N".repeat(n)],
  ["contact", () => contactSchema, person, "email", NAME_MAX, email],
  ["contact", () => contactSchema, person, "phone", TEXT_MAX, (n) => "1".repeat(n)],
  ["contact", () => contactSchema, person, "job_title", TEXT_MAX, (n) => "j".repeat(n)],
  ["deal", () => dealSchema(true), deal, "name", NAME_MAX, (n) => "N".repeat(n)],
  ["activity", () => activitySchema, activity, "description", TEXT_MAX, (n) => "d".repeat(n)],
];

test.each(TEXT_FIELDS)("%s %s: at the limit is fine, one more is refused", (_form, schema, base, field, limit, make) => {
  expect(schema().safeParse({ ...base, [field]: make(limit) }).success).toBe(true);
  expect(errors(schema().safeParse({ ...base, [field]: make(limit + 1) }))).toEqual({
    [field]: `Keep this to ${limit.toLocaleString("en-US")} characters or fewer.`,
  });
});

test("spaces around text don't count towards the limit", () => {
  expect(organizationSchema.safeParse({ ...org, name: `  ${"N".repeat(NAME_MAX)}  ` }).success).toBe(true);
});

test.each([
  ["name@company.com", true],
  ["a.b+c@mail.example.co.uk", true],
  ["a@b.c", true],
  ["a@b", false],
  ["a@b..c", false],
  ["a@.b.c", false],
  ["a@b.c.", false],
  ["a@b@c.com", false],
])("email %s matches the backend's rule: %s", (address, ok) => {
  expect(EMAIL_RE.test(address)).toBe(ok);
});

test("a long crafted email is refused for its length, quickly", () => {
  const started = performance.now();
  const result = contactSchema.safeParse({ ...person, email: "a@" + "a.".repeat(40_000) + "@" });
  expect(performance.now() - started).toBeLessThan(500);
  expect(errors(result)).toEqual({ email: "Keep this to 200 characters or fewer." });
});
