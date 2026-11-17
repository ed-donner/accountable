import { test, expect } from "./fixtures";

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
  await expect(deal.getByText("Enter a value of 0 or more, in whole dollars.")).toBeVisible();
  await expect(deal.getByLabel("Value (US dollars)")).toHaveValue("-10");
  await page.keyboard.press("Escape");
  await expect(deal).toBeHidden();
});
