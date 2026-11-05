import { useEffect } from "react";
import { toast } from "sonner";

type Read = { data: unknown; isError: boolean; isFetching: boolean };

/**
 * A form that can't read what it needs closes and says so. Left open, a failed
 * list would look like an empty one, and invite adding a record that already exists.
 */
export function useCloseIfUnreadable(reads: Read[], onClose: () => void) {
  const failed = reads.some((read) => read.data === undefined && read.isError && !read.isFetching);

  useEffect(() => {
    if (!failed) return;
    toast.error("Couldn't open the form. Try again.", { id: "form-unreadable" });
    onClose();
  }, [failed, onClose]);
}
