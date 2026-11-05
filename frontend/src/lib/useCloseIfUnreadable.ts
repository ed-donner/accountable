import { useEffect } from "react";

import { useNotify } from "./notify";

type Read = { data: unknown; isError: boolean; isFetching: boolean };

/**
 * A form that can't read what it needs closes and says so. Left open, a failed
 * list would look like an empty one, and invite adding a record that already exists.
 */
export function useCloseIfUnreadable(reads: Read[], onClose: () => void) {
  const notify = useNotify();
  const failed = reads.some((read) => read.data === undefined && read.isError && !read.isFetching);

  useEffect(() => {
    if (!failed) return;
    notify.error("Couldn't open the form. Try again.", { id: "form-unreadable" });
    onClose();
  }, [failed, onClose, notify]);
}
