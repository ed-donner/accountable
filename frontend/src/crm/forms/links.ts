import { z } from "zod";

/** A picker's value: required, unless a delete left the link blank. */
export function link(blankAllowed: boolean, message: string) {
  return z
    .number()
    .nullable()
    .refine((id) => id !== null || blankAllowed, message);
}
