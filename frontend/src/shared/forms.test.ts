// applyServerErrors: per-field messages go under their fields; anything else is shown for the form.
import { ApiError, GENERAL_MESSAGE } from "./api";
import { applyServerErrors } from "./forms";

const FIELDS = ["description", "type"] as const;

test("a message for a field the form has goes under that field", () => {
  const setError = vi.fn();
  const error = new ApiError("Check the highlighted fields and try again.", 400, { description: "Enter a description." });
  expect(applyServerErrors(error, setError, FIELDS)).toBeNull();
  expect(setError).toHaveBeenCalledWith("description", { type: "server", message: "Enter a description." });
});

test("a message about a record the form has no field for is shown for the whole form", () => {
  const setError = vi.fn();
  const error = new ApiError("Check the highlighted fields and try again.", 400, { deal_id: "That deal no longer exists." });
  expect(applyServerErrors(error, setError, FIELDS)).toBe("That deal no longer exists.");
  expect(setError).not.toHaveBeenCalled();
});

test("with no field messages, the overall message is shown", () => {
  expect(applyServerErrors(new ApiError("Accountable isn't running.", 0), vi.fn(), FIELDS)).toBe("Accountable isn't running.");
  expect(applyServerErrors(new Error("boom"), vi.fn(), FIELDS)).toBe(GENERAL_MESSAGE);
});
