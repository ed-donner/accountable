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
  // A message about something the form has no field for, such as "That deal no
  // longer exists.", is shown for the whole form, since nothing can be highlighted.
  const unplaced: string[] = [];
  for (const [field, message] of Object.entries(error.fields)) {
    if (fields.includes(field)) {
      setError(field as Path<T>, { type: "server", message });
      placed = true;
    } else {
      unplaced.push(message);
    }
  }
  if (unplaced.length > 0) return unplaced.join(" ");
  return placed ? null : error.message;
}
