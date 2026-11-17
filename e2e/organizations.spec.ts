import { test, expect, API, TODAY } from "./fixtures";

test("TE02 add, search, sort, page and edit organizations; the page shows contacts and deals", async ({ page, request }) => {
  await page.goto("/organizations");
  await expect(page.getByText("12 organizations")).toBeVisible();

  // Add, in the side panel.
  await page.getByRole("button", { name: "Add organization" }).first().click();
  const panel = page.getByRole("dialog", { name: "Add organization" });
  await panel.getByLabel("Name").fill("Zenith Robotics");
  await panel.getByLabel("Website").fill("zenithrobotics.example.com");
  await panel.getByLabel("Industry").fill("Software");
  await panel.getByRole("button", { name: "Add organization" }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("row", { name: /Zenith Robotics/ })).toContainText("zenithrobotics.example.com");

  // Search as you type.
  await page.getByRole("searchbox", { name: "Search organizations" }).fill("zenith");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search organizations" }).fill("");

  // Sort: name ascending first, then descending.
  const nameHeader = page.getByRole("columnheader", { name: "Name" });
  await expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  await nameHeader.getByRole("button").click();
  await expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("row").nth(1)).toContainText("Zenith Robotics");

  // Page: 27 organizations make two pages.
  for (let i = 0; i < 14; i++) {
    await request.post(`${API}/organizations`, { data: { name: `Paging Co ${i}` }, headers: { "X-Local-Date": TODAY } });
  }
  await page.reload();
  await expect(page.getByText("Showing 1 to 25 of 27")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Showing 26 to 27 of 27")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(3);

  // Edit from the row.
  await page.goto("/organizations");
  await page.getByRole("searchbox").fill("zenith");
  await page.getByRole("button", { name: "Edit Zenith Robotics" }).click();
  const edit = page.getByRole("dialog", { name: "Edit organization" });
  await expect(edit.getByLabel("Name")).toHaveValue("Zenith Robotics");
  await edit.getByLabel("Name").fill("Zenith Robotics Group");
  await edit.getByLabel("Name").press("Enter");
  await expect(edit).toBeHidden();
  await expect(page.getByRole("row", { name: /Zenith Robotics Group/ })).toBeVisible();

  // The organization's page shows its contacts and deals.
  await page.getByRole("searchbox").fill("Wilson");
  await page.getByRole("row", { name: /Wilson Software/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Wilson Software" })).toBeVisible();
  const contacts = page.getByRole("region", { name: "Contacts" });
  await expect(contacts.getByRole("listitem")).toHaveCount(4);
  await expect(contacts.getByRole("link", { name: "Karen Willis" })).toBeVisible();
  const deals = page.getByRole("region", { name: "Deals" });
  await expect(deals.getByRole("link", { name: "Wilson pilot project" })).toBeVisible();

  // Add a contact already linked to it.
  await contacts.getByRole("button", { name: "Add contact" }).click();
  const add = page.getByRole("dialog", { name: "Add contact" });
  await expect(add.getByLabel("Organization")).toHaveValue(/\d+/);
  await add.getByLabel("Name").fill("Nadia Brooks");
  await add.getByRole("button", { name: "Add contact" }).click();
  await expect(contacts.getByRole("link", { name: "Nadia Brooks" })).toBeVisible();
});

test("TE03 delete asks first, says what happens, and linked records stay", async ({ page }) => {
  await page.goto("/organizations");
  await page.getByRole("searchbox").fill("Wilson");
  await page.getByRole("button", { name: "Delete Wilson Software" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete Wilson Software?" });
  await expect(dialog).toContainText("Wilson Software has 4 contacts and 3 deals. They'll be kept, with no organization.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: /Wilson Software/ })).toBeVisible();

  await page.getByRole("button", { name: "Delete Wilson Software" }).click();
  await page.getByRole("button", { name: "Delete organization" }).click();
  await expect(page.getByText("No organizations match “Wilson”.")).toBeVisible();

  // Contacts and deals stay, with no organization, and keep their timeline.
  await page.goto("/contacts");
  await page.getByRole("searchbox").fill("Karen Willis");
  await page.getByRole("row", { name: /Karen Willis/ }).click();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("No organization");
  await expect(page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first()).toBeVisible();
  await page.goto("/deals");
  await page.getByRole("searchbox").fill("Wilson pilot");
  await page.getByRole("row", { name: /Wilson pilot project/ }).click();
  await expect(page.getByText("This deal has no organization. Edit it to choose one.")).toBeVisible();
});

test("TE02 adding from an organization's page, opened directly, starts linked to it", async ({ page }) => {
  await page.goto("/organizations");
  const link = page.getByRole("link", { name: "Wilson Software" });
  const href = (await link.getAttribute("href"))!;
  await page.goto(href); // a fresh load, with no lists cached yet
  await page.getByRole("region", { name: "Deals" }).getByRole("button", { name: "Add deal" }).click();
  const panel = page.getByRole("dialog", { name: "Add deal" });
  await expect(panel.getByLabel("Organization")).toHaveValue(href.split("/").pop()!);
  await expect(panel.getByLabel("Name")).toBeFocused();
  await panel.getByLabel("Name").fill("Wilson security review");
  await panel.getByLabel("Value (US dollars)").fill("12000");
  await panel.getByRole("button", { name: "Add deal" }).click();
  await expect(page.getByRole("region", { name: "Deals" }).getByRole("link", { name: "Wilson security review" })).toBeVisible();
});
