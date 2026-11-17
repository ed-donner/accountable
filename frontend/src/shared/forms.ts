import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError, GENERAL_MESSAGE } from "./api";

/** Puts the backend's per-field messages under their fields (V4) and returns any
 * message for the whole form. What was typed stays in the form (V3). */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): string | null {
  if (!(error instanceof ApiError)) return GENERAL_MESSAGE;
  let placed = false;
  for (const [field, message] of Object.entries(error.fields)) {
    if (fields.includes(field)) {
      setError(field as Path<T>, { type: "server", message });
      placed = true;
    }
  }
  return placed ? null : error.message;
}
