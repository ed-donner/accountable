import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { META, ORGS, fakeApi, renderWithApp } from "@/test/render";
import { OrganizationForm } from "./OrganizationForm";

describe("OrganizationForm", () => {
  it("shows a duplicate name, in other capitals, before saving (ORG-1, decision 10)", async () => {
    const { calls } = fakeApi({ "GET /api/meta": META, "GET /api/organizations": ORGS });
    const { user } = renderWithApp(<OrganizationForm open onOpenChange={() => {}} />);
    await screen.findByRole("dialog", { name: "Add organization" });
    // Wait for the list to load, then type.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await user.type(screen.getByLabelText(/Name/), "BLUEFIN logistics");
    expect(await screen.findByText("An organization called Bluefin Logistics already exists.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add organization" }));
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("lets an organization keep its own name in other capitals", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations": ORGS });
    const { user } = renderWithApp(<OrganizationForm open onOpenChange={() => {}} organization={ORGS[0]} />);
    const name = await screen.findByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, "BLUEFIN Logistics");
    await user.tab();
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
  });
});
