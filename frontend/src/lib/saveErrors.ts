import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api";
import type { Notify } from "./notify";

type Form<T extends FieldValues> = { setError: UseFormSetError<T>; getValues: UseFormGetValues<T>; notify: Notify };

/** The message that's about the whole form rather than one field, such as a draft that can't be issued. */
export const FORM_ERROR = "form";

/** Whether the form has a field at this path, such as "name", or "lines.2.quantity" for a field inside a list. */
function hasField(values: unknown, path: string): boolean {
  let at = values;
  for (const key of path.split(".")) {
    if (typeof at !== "object" || at === null || !(key in at)) return false;
    at = (at as Record<string, unknown>)[key];
  }
  return true;
}

/**
 * Puts the server's messages beside their fields, a line's beside that line's box, and a
 * message about the whole form at its top, as root.form. Anything else goes in a message,
 * since an error on a field this form doesn't have would otherwise never be seen.
 */
export function showSaveError<T extends FieldValues>(error: unknown, { setError, getValues, notify }: Form<T>) {
  if (error instanceof ApiError && error.kind === "fields") {
    const values = getValues();
    for (const [field, message] of Object.entries(error.fields)) {
      if (field === FORM_ERROR) setError(`root.${FORM_ERROR}`, { type: "server", message });
      else if (hasField(values, field)) setError(field as Path<T>, { type: "server", message });
      else notify.error(message);
    }
    return;
  }
  notify.error(error instanceof Error ? error.message : "Something went wrong.");
}
