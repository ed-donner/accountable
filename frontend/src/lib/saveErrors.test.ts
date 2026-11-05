import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { showSaveError } from "./saveErrors";

function form() {
  const parts = {
    setError: vi.fn(),
    getValues: vi.fn(() => ({ name: "Acme", website: "" })),
    notify: { success: vi.fn(), error: vi.fn() },
  };
  return parts as unknown as Parameters<typeof showSaveError>[1];
}

describe("showSaveError", () => {
  it("puts a message beside a field the form has", () => {
    const shown = form();
    const failure = shown.notify.error;
    showSaveError(new ApiError("fields", "Check the form.", { name: "Enter a name" }), shown);
    expect(shown.setError).toHaveBeenCalledWith("name", { type: "server", message: "Enter a name" });
    expect(failure).not.toHaveBeenCalled();
  });

  it("shows a message for a field the form doesn't have, where it would otherwise never be seen", () => {
    const shown = form();
    const failure = shown.notify.error;
    showSaveError(new ApiError("fields", "Check the form.", { deal_id: "That record no longer exists" }), shown);
    expect(shown.setError).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith("That record no longer exists");
  });

  it("handles a mix of the two", () => {
    const shown = form();
    const failure = shown.notify.error;
    showSaveError(
      new ApiError("fields", "Check the form.", { website: "Enter a website", body: "Check this field" }),
      shown,
    );
    expect(shown.setError).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith("Check this field");
  });

  it("puts a line's message beside that line's box, named by its place", () => {
    const shown = form();
    vi.mocked(shown.getValues).mockReturnValue({
      lines: [{ quantity: "1" }, { quantity: "2" }, { quantity: "lots" }],
    } as never);
    showSaveError(
      new ApiError("fields", "Check the form.", { "lines.2.quantity": "Enter a whole number from 1 to 1,000,000" }),
      shown,
    );
    expect(shown.setError).toHaveBeenCalledWith("lines.2.quantity", {
      type: "server",
      message: "Enter a whole number from 1 to 1,000,000",
    });
    expect(shown.notify.error).not.toHaveBeenCalled();
  });

  it("shows a message for a line's field the form doesn't have, or a line it doesn't have", () => {
    const shown = form();
    vi.mocked(shown.getValues).mockReturnValue({ lines: [{ quantity: "1" }] } as never);
    showSaveError(
      new ApiError("fields", "Check the form.", {
        "lines.0.product_id": "This product is archived. Choose another.",
        "lines.4.quantity": "Enter a whole number from 1 to 1,000,000",
      }),
      shown,
    );
    expect(shown.setError).not.toHaveBeenCalled();
    expect(shown.notify.error).toHaveBeenCalledWith("This product is archived. Choose another.");
    expect(shown.notify.error).toHaveBeenCalledWith("Enter a whole number from 1 to 1,000,000");
  });

  it("shows anything else as a message", () => {
    const shown = form();
    showSaveError(new ApiError("server", "Something went wrong."), shown);
    const failure = shown.notify.error;
    expect(failure).toHaveBeenCalledWith("Something went wrong.");
  });

  it("copes with an error that isn't an Error", () => {
    const shown = form();
    showSaveError("odd", shown);
    const failure = shown.notify.error;
    expect(failure).toHaveBeenCalledWith("Something went wrong.");
  });
});
