// Toasts: short messages that dismiss themselves, errors staying longer, at most three at once.
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

afterEach(() => vi.useRealTimers());

function Buttons() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Saved.")}>Save</button>
      <button onClick={() => toast.error("Couldn't save.")}>Fail</button>
    </>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Buttons />
    </ToastProvider>,
  );
  return screen.getByRole("status");
}

test("a toast can be dismissed", async () => {
  const toasts = setup();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(toasts).toHaveTextContent("Saved.");
  await userEvent.click(within(toasts).getByRole("button", { name: "Dismiss" }));
  expect(toasts).toBeEmptyDOMElement();
});

test("a success goes after a few seconds, an error stays longer", () => {
  vi.useFakeTimers();
  const toasts = setup();
  act(() => {
    screen.getByRole("button", { name: "Save" }).click();
    screen.getByRole("button", { name: "Fail" }).click();
  });
  act(() => vi.advanceTimersByTime(4000));
  expect(toasts).not.toHaveTextContent("Saved.");
  expect(toasts).toHaveTextContent("Couldn't save.");
  act(() => vi.advanceTimersByTime(3500));
  expect(toasts).toBeEmptyDOMElement();
});

test("only the three newest toasts show", async () => {
  const toasts = setup();
  const save = screen.getByRole("button", { name: "Save" });
  const fail = screen.getByRole("button", { name: "Fail" });
  for (const button of [fail, save, save, save]) await userEvent.click(button);
  expect(within(toasts).getAllByRole("button", { name: "Dismiss" })).toHaveLength(3);
  expect(toasts).not.toHaveTextContent("Couldn't save.");
});

test("useToast outside a ToastProvider is a mistake that says so", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => renderHook(() => useToast())).toThrow("useToast needs a ToastProvider");
  vi.restoreAllMocks();
});
