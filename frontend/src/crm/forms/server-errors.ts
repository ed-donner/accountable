import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import { ApiError } from "../../lib/api";

/** Puts the server's messages beside their fields, and anything else in a message. */
export function showSaveError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>) {
  if (error instanceof ApiError && error.kind === "fields") {
    for (const [field, message] of Object.entries(error.fields)) {
      setError(field as Path<T>, { type: "server", message });
    }
    return;
  }
  toast.error(error instanceof Error ? error.message : "Something went wrong.");
}
