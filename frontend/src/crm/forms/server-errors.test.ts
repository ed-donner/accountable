import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import { showSaveError } from "./server-errors";

function form() {
  const parts = { setError: vi.fn(), getValues: vi.fn(() => ({ name: "Acme", website: "" })) };
  return parts as unknown as Parameters<typeof showSaveError>[1];
}

describe("showSaveError", () => {
  it("puts a message beside a field the form has", () => {
    const failure = vi.spyOn(toast, "error");
    const shown = form();
    showSaveError(new ApiError("fields", "Check the form.", { name: "Enter a name" }), shown);
    expect(shown.setError).toHaveBeenCalledWith("name", { type: "server", message: "Enter a name" });
    expect(failure).not.toHaveBeenCalled();
  });

  it("shows a message for a field the form doesn't have, where it would otherwise never be seen", () => {
    const failure = vi.spyOn(toast, "error");
    const shown = form();
    showSaveError(new ApiError("fields", "Check the form.", { deal_id: "That record no longer exists" }), shown);
    expect(shown.setError).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith("That record no longer exists");
  });

  it("handles a mix of the two", () => {
    const failure = vi.spyOn(toast, "error");
    const shown = form();
    showSaveError(new ApiError("fields", "Check the form.", { website: "Enter a website", body: "Check this field" }), shown);
    expect(shown.setError).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith("Check this field");
  });

  it("shows anything else as a message", () => {
    const failure = vi.spyOn(toast, "error");
    showSaveError(new ApiError("server", "Something went wrong."), form());
    expect(failure).toHaveBeenCalledWith("Something went wrong.");
  });

  it("copes with an error that isn't an Error", () => {
    const failure = vi.spyOn(toast, "error");
    showSaveError("odd", form());
    expect(failure).toHaveBeenCalledWith("Something went wrong.");
  });
});
