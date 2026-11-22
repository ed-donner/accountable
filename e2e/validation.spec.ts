import { API, test, expect } from "./fixtures";

test("TE08 required and format errors show under fields and keep what was typed", async ({ page }) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact" }).first().click();
  const panel = page.getByRole("dialog", { name: "Add contact" });
  await panel.getByLabel("Email").fill("ada@");
  await panel.getByLabel("Job title").fill("Buyer");
  await panel.getByRole("button", { name: "Add contact" }).click();
  await expect(panel.getByText("Enter a name.")).toBeVisible();
  await expect(panel.getByText("Enter an email address like name@company.com.")).toBeVisible();
  await expect(panel.getByLabel("Email")).toHaveValue("ada@");
  await expect(panel.getByLabel("Job title")).toHaveValue("Buyer");
  await expect(panel.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await panel.getByLabel("Name").fill("Ada Park");
  await panel.getByLabel("Email").fill("ada@park.example.com");
  await panel.getByRole("button", { name: "Add contact" }).click();
  await expect(panel).toBeHidden();

  await page.goto("/organizations");
  await page.getByRole("button", { name: "Add organization" }).first().click();
  const org = page.getByRole("dialog", { name: "Add organization" });
  await org.getByLabel("Name").fill("Park Studio");
  await org.getByLabel("Website").fill("not a website");
  await org.getByRole("button", { name: "Add organization" }).click();
  await expect(org.getByText("Enter a website like company.com.")).toBeVisible();
  await org.getByLabel("Website").fill("parkstudio.example.com");
  await org.getByRole("button", { name: "Add organization" }).click();
  await expect(page.getByRole("row", { name: /Park Studio/ })).toContainText("parkstudio.example.com");

  await page.goto("/deals");
  await page.getByRole("button", { name: "Add deal" }).first().click();
  const deal = page.getByRole("dialog", { name: "Add deal" });
  await deal.getByLabel("Value (US dollars)").fill("-10");
  await deal.getByRole("button", { name: "Add deal" }).click();
  await expect(deal.getByText("Enter a name.")).toBeVisible();
  await expect(deal.getByText("Choose an organization.")).toBeVisible();
  await expect(deal.getByText("Enter a value from 0 to 1,000,000,000, in whole dollars.")).toBeVisible();
  await expect(deal.getByLabel("Value (US dollars)")).toHaveValue("-10");
  await page.keyboard.press("Escape");
  await expect(deal).toBeHidden();
});

test("TE08 too long or too large shows under the field, keeps what was typed and saves nothing (RV1, RV10)", async ({ page, request }) => {
  const count = async (path: string) => (await (await request.get(`${API}/${path}?limit=1`)).json()).total;
  const before = { contacts: await count("contacts"), organizations: await count("organizations"), deals: await count("deals") };

  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact" }).first().click();
  const contact = page.getByRole("dialog", { name: "Add contact" });
  await contact.getByLabel("Name").fill("N".repeat(201));
  await contact.getByRole("button", { name: "Add contact" }).click();
  await expect(contact.getByText("Keep this to 200 characters or fewer.")).toBeVisible();
  await expect(contact.getByLabel("Name")).toHaveValue("N".repeat(201));
  await page.keyboard.press("Escape");

  await page.goto("/organizations");
  await page.getByRole("button", { name: "Add organization" }).first().click();
  const org = page.getByRole("dialog", { name: "Add organization" });
  await org.getByLabel("Name").fill("Long Notes Ltd");
  await org.getByLabel("Notes").fill("n".repeat(10_001));
  await org.getByRole("button", { name: "Add organization" }).click();
  await expect(org.getByText("Keep this to 10,000 characters or fewer.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/deals");
  await page.getByRole("button", { name: "Add deal" }).first().click();
  const deal = page.getByRole("dialog", { name: "Add deal" });
  await deal.getByLabel("Name").fill("Too big");
  await deal.getByLabel("Organization").selectOption({ label: "Wilson Software" });
  for (const value of ["1,000,000,001", "99999999999999999999"]) {
    await deal.getByLabel("Value (US dollars)").fill(value);
    await deal.getByRole("button", { name: "Add deal" }).click();
    await expect(deal.getByText("Enter a value from 0 to 1,000,000,000, in whole dollars.")).toBeVisible();
    await expect(deal.getByLabel("Value (US dollars)")).toHaveValue(value);
  }
  await page.keyboard.press("Escape");

  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("link", { name: "Karen Willis" }).click();
  await page.getByLabel("What happened").fill("d".repeat(10_001));
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Keep this to 10,000 characters or fewer.")).toBeVisible();

  expect({ contacts: await count("contacts"), organizations: await count("organizations"), deals: await count("deals") }).toEqual(before);
});
