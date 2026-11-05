import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import { ApiError } from "./api";

type Form<T extends FieldValues> = { setError: UseFormSetError<T>; getValues: UseFormGetValues<T> };

/**
 * Puts the server's messages beside their fields, and anything else in a message.
 * An error on a field this form doesn't have would otherwise never be seen.
 */
export function showSaveError<T extends FieldValues>(error: unknown, { setError, getValues }: Form<T>) {
  if (error instanceof ApiError && error.kind === "fields") {
    const fields = getValues();
    for (const [field, message] of Object.entries(error.fields)) {
      if (field in fields) setError(field as Path<T>, { type: "server", message });
      else toast.error(message);
    }
    return;
  }
  toast.error(error instanceof Error ? error.message : "Something went wrong.");
}
