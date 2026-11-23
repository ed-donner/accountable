// T4: a form panel takes focus, closes on Escape, Close or a click outside, and gives focus back.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SidePanel } from "./SidePanel";

function Page({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <SidePanel title="Add thing" open={open} onClose={close}>
        <label>
          Name <input />
        </label>
      </SidePanel>
    </>
  );
}

async function openPanel(onClose = vi.fn()) {
  render(<Page onClose={onClose} />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  return screen.getByRole("dialog", { name: "Add thing" });
}

test("a closed panel shows nothing", () => {
  render(<Page />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("opening puts the cursor in the first field; Escape closes and returns focus", async () => {
  const onClose = vi.fn();
  await openPanel(onClose);
  expect(screen.getByRole("heading", { name: "Add thing" })).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
});

test("Close closes the panel", async () => {
  const panel = await openPanel();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(panel).not.toBeInTheDocument();
});

test("a click outside the panel closes it; a click inside doesn't", async () => {
  const onClose = vi.fn();
  const panel = await openPanel(onClose);
  await userEvent.click(screen.getByLabelText("Name"));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(panel.parentElement!);
  expect(onClose).toHaveBeenCalledOnce();
});
