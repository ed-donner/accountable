// TF11: required fields, email and website formats, plain messages.
import { activitySchema, contactSchema, dealSchema, organizationSchema, withHttps } from "./validation";

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
    value: "Enter a value of 0 or more, in whole dollars.",
  });
  expect(errors(dealSchema(true).safeParse({ ...base, value: "-5" })).value).toBeDefined();
  expect(errors(dealSchema(true).safeParse({ ...base, value: "10.5" })).value).toBeDefined();
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
