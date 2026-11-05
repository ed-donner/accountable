import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api";
import type { Notify } from "./notify";

type Form<T extends FieldValues> = { setError: UseFormSetError<T>; getValues: UseFormGetValues<T>; notify: Notify };

/**
 * Puts the server's messages beside their fields, and anything else in a message.
 * An error on a field this form doesn't have would otherwise never be seen.
 */
export function showSaveError<T extends FieldValues>(error: unknown, { setError, getValues, notify }: Form<T>) {
  if (error instanceof ApiError && error.kind === "fields") {
    const fields = getValues();
    for (const [field, message] of Object.entries(error.fields)) {
      if (field in fields) setError(field as Path<T>, { type: "server", message });
      else notify.error(message);
    }
    return;
  }
  notify.error(error instanceof Error ? error.message : "Something went wrong.");
}
