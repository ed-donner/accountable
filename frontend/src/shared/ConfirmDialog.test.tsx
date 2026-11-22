// TF08: the delete confirmation names the record and the effect on linked records.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ConfirmDialog,
  contactDeleteMessage,
  dealDeleteMessage,
  organizationDeleteMessage,
} from "./ConfirmDialog";

test("organization message", () => {
  expect(organizationDeleteMessage({ name: "Acme Ltd", contacts: 4, deals: 2 })).toBe(
    "Acme Ltd has 4 contacts and 2 deals. They'll be kept, with no organization. This can't be undone.",
  );
  expect(organizationDeleteMessage({ name: "Acme Ltd", contacts: 1, deals: 0 })).toBe(
    "Acme Ltd has 1 contact. They'll be kept, with no organization. This can't be undone.",
  );
  expect(organizationDeleteMessage({ name: "Acme Ltd", contacts: 0, deals: 0 })).toBe(
    "Acme Ltd has no contacts or deals. This can't be undone.",
  );
});

test("contact message", () => {
  expect(contactDeleteMessage({ name: "Ada Park", deals: 2, activities: 5 })).toBe(
    "Ada Park is the main contact on 2 deals. They'll be kept, with no main contact. 5 activities logged on Ada Park will be deleted. This can't be undone.",
  );
});

test("deal message", () => {
  expect(dealDeleteMessage({ name: "Renewal", activities: 1, stage_changes: 3 })).toBe(
    "Renewal has 1 activity and 3 stage changes. They'll be deleted with it. This can't be undone.",
  );
});

test("the dialog asks first and confirms or cancels", async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete Acme Ltd?"
      message={organizationDeleteMessage({ name: "Acme Ltd", contacts: 4, deals: 2 })}
      confirmLabel="Delete organization"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  const dialog = screen.getByRole("alertdialog", { name: "Delete Acme Ltd?" });
  expect(dialog).toHaveAccessibleDescription(/4 contacts and 2 deals/);
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(onCancel).toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Delete organization" }));
  expect(onConfirm).toHaveBeenCalled();
});
