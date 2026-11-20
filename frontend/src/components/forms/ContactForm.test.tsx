import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Contact } from "@/api/types";
import { CONTACTS, DEAL, META, ORGS, fakeApi, renderWithApp } from "@/test/render";
import { ContactForm } from "./ContactForm";

describe("ContactForm", () => {
  it("lists the deals that will lose their main contact when the organization changes (CON-5)", async () => {
    fakeApi({
      "GET /api/meta": META,
      "GET /api/organizations": ORGS,
      "GET /api/contacts/10": { ...CONTACTS[0], deals: [DEAL] },
    });
    const { user } = renderWithApp(
      <ContactForm open onOpenChange={() => {}} contact={CONTACTS[0] as unknown as Contact} />,
    );
    await waitFor(() => expect(screen.getByLabelText("Organization")).toHaveTextContent("Bluefin Logistics"));
    expect(screen.queryByText(/will stop being the main contact/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Organization"));
    await user.click(await screen.findByRole("option", { name: /^Cedar Health/ }));
    expect(await screen.findByText("Sarah Chen will stop being the main contact on this deal:")).toBeInTheDocument();
    expect(screen.getByText("Website redesign")).toBeInTheDocument();

    // Removing the organization says the same.
    await user.click(screen.getByLabelText("Organization"));
    await user.click(await screen.findByRole("option", { name: /No organization/ }));
    expect(screen.getByText("Sarah Chen will stop being the main contact on this deal:")).toBeInTheDocument();

    // Back to the old organization, nothing changes.
    await user.click(screen.getByLabelText("Organization"));
    await user.click(await screen.findByRole("option", { name: /^Bluefin Logistics/ }));
    expect(screen.queryByText(/will stop being the main contact/)).not.toBeInTheDocument();
  });

  it("starts a new contact as Lead", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/organizations": ORGS });
    renderWithApp(<ContactForm open onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/Status/)).toHaveValue("lead");
  });
});
