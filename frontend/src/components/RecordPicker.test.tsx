import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { OrganizationForm } from "../crm/forms/OrganizationForm";
import { mockApi, renderApp, user } from "../test-utils";
import { FormDialog } from "./FormDialog";
import { RecordPicker, type PickerOption } from "./RecordPicker";

const OPTIONS: PickerOption[] = [
  { id: 1, name: "Harbor & Pine" },
  { id: 2, name: "Lantern Hotels" },
  { id: 3, name: "Juniper Health" },
];

function Picker({ onAdd, start = null }: { onAdd?: (name: string) => void; start?: number | null }) {
  const [value, setValue] = useState<number | null>(start);
  return (
    <RecordPicker
      label="Organization"
      noun="organization"
      value={value}
      options={OPTIONS}
      onChange={setValue}
      onAdd={onAdd}
    />
  );
}

async function open() {
  await user().click(screen.getByRole("combobox", { name: "Organization" }));
}

describe("RecordPicker", () => {
  it("shows the options when opened", async () => {
    render(<Picker />);
    await open();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("narrows as you search, ignoring case", async () => {
    render(<Picker />);
    await open();
    await user().type(screen.getByPlaceholderText("Search organizations"), "LANT");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Lantern Hotels"]);
  });

  it("selects a record", async () => {
    render(<Picker />);
    await open();
    await user().click(screen.getByRole("option", { name: "Juniper Health" }));
    expect(screen.getByRole("combobox", { name: "Organization" }).textContent).toContain("Juniper Health");
  });

  it("shows a placeholder when nothing is chosen, and None for a blank link", () => {
    render(
      <RecordPicker
        label="Organization"
        noun="organization"
        value={null}
        options={OPTIONS}
        placeholder="None"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Organization" }).textContent).toContain("None");
  });

  it("offers to add the record when nothing matches", async () => {
    const onAdd = vi.fn();
    render(<Picker onAdd={onAdd} />);
    await open();
    await user().type(screen.getByPlaceholderText("Search organizations"), "Acme");
    expect(screen.getByText("No organizations match.")).toBeTruthy();
    await user().click(screen.getByRole("option", { name: 'Add "Acme"' }));
    expect(onAdd).toHaveBeenCalledWith("Acme");
  });

  it("doesn't offer to add while something matches", async () => {
    render(<Picker onAdd={vi.fn()} />);
    await open();
    await user().type(screen.getByPlaceholderText("Search organizations"), "Lantern");
    expect(screen.queryByRole("option", { name: /Add/ })).toBeNull();
  });

  it("shows the first 50 of a long list, and search reaches the rest", async () => {
    const options = Array.from({ length: 300 }, (_, index) => ({ id: index, name: `Contact ${index}` }));
    render(<RecordPicker label="Organization" noun="organization" value={null} options={options} onChange={vi.fn()} />);
    await open();
    expect(screen.getAllByRole("option")).toHaveLength(50);
    await user().type(screen.getByPlaceholderText("Search organizations"), "Contact 299");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Contact 299"]);
  });
});

describe("a long list", () => {
  it("still names a chosen record that's past the first 50", () => {
    const options = Array.from({ length: 120 }, (_, index) => ({ id: index + 1, name: `Company ${index + 1}` }));
    render(<RecordPicker label="Organization" noun="organization" value={120} options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Organization" }).textContent).toContain("Company 120");
  });
});

describe("adding from a picker inside a form", () => {
  function DealLikeForm({ onOuterSubmit }: { onOuterSubmit: () => void }) {
    const [value, setValue] = useState<number | null>(null);
    const [adding, setAdding] = useState<string | null>(null);
    const [options, setOptions] = useState(OPTIONS);
    return (
      <FormDialog title="Add deal" submitLabel="Save deal" onClose={vi.fn()} onSubmit={async () => onOuterSubmit()}>
        <RecordPicker
          label="Organization"
          noun="organization"
          value={value}
          options={options}
          onChange={setValue}
          onAdd={setAdding}
        />
        {adding !== null && (
          <OrganizationForm
            defaultName={adding}
            onClose={() => setAdding(null)}
            onSaved={(saved) => {
              setOptions((current) => [...current, { id: saved.id, name: saved.name }]);
              setValue(saved.id);
            }}
          />
        )}
      </FormDialog>
    );
  }

  it("selects the new record and leaves the outer form open and unsubmitted", async () => {
    mockApi({
      "POST /organizations": (body: { name: string }) => ({
        status: 201,
        body: { id: 9, website: null, industry: null, notes: null, contacts: [], deals: [], ...body },
      }),
    });
    const onOuterSubmit = vi.fn();
    renderApp(<DealLikeForm onOuterSubmit={onOuterSubmit} />);

    await open();
    await user().type(screen.getByPlaceholderText("Search organizations"), "Acme");
    await user().click(screen.getByRole("option", { name: 'Add "Acme"' }));

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Acme");
    await user().click(screen.getByRole("button", { name: "Save organization" }));

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Organization" }).textContent).toContain("Acme"));
    expect(screen.getByRole("heading", { name: "Add deal" })).toBeTruthy();
    expect(onOuterSubmit).not.toHaveBeenCalled();
  });
});
