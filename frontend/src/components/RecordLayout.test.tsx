import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { user } from "../test-utils";
import { RecordHeader, type HeaderAction } from "./RecordLayout";

function buttons() {
  return screen.getAllByRole("button").map((button) => button.textContent);
}

function markPaid(): HeaderAction {
  return { label: "Mark paid", icon: <span aria-hidden="true" />, onClick: vi.fn() };
}

describe("a record page's header", () => {
  it("has Edit and Delete", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<RecordHeader title="Harbor & Pine" onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByRole("heading", { name: "Harbor & Pine" })).toBeTruthy();
    expect(buttons()).toEqual(["Edit", "Delete"]);
    await user().click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("has an action in place of Delete", () => {
    render(<RecordHeader title="Pro license" onEdit={vi.fn()} action={{ ...markPaid(), label: "Archive" }} />);
    expect(buttons()).toEqual(["Edit", "Archive"]);
  });

  it("has an action and Delete together, in that order after Edit", async () => {
    const action = markPaid();
    const onDelete = vi.fn();
    render(<RecordHeader title="Bill INV-0042" onEdit={vi.fn()} action={action} onDelete={onDelete} />);
    expect(buttons()).toEqual(["Edit", "Mark paid", "Delete"]);
    await user().click(screen.getByRole("button", { name: "Mark paid" }));
    expect(action.onClick).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("holds the action while it's being saved, and leaves Delete alone", () => {
    render(
      <RecordHeader
        title="Bill INV-0042"
        onEdit={vi.fn()}
        action={{ ...markPaid(), pending: true }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Mark paid" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Delete" }).disabled).toBe(false);
  });

  it("shows its chips after the title", () => {
    render(<RecordHeader title="Bill INV-0042" chips={<span>Overdue</span>} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Overdue")).toBeTruthy();
  });
});
