import type { FormEventHandler, ReactNode } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { messages } from "@/lib/words";
import { cn } from "@/lib/utils";

type FormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  /** Shown above the buttons, such as the deals that will lose their main contact (CON-5). */
  notice?: ReactNode;
};

/** The dialog every form opens in: 560px, labels above fields, the main button naming the action. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  onSubmit,
  children,
  notice,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? "Fields marked with a star are required."}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={onSubmit} className="grid gap-4">
          {children}
          {notice}
          <DialogFooter>
            <Button variant="second" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  /** Keep the label for screen readers but hide it, when a placeholder says the same. */
  hideLabel?: boolean;
  children: ReactNode;
};

/** A label above its field, with any problem shown under it (GEN-6). */
export function Field({ id, label, required, error, hint, className, hideLabel, children }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
        {required && (
          <span className="text-raspberry-text" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {hint && !error && <p className="text-[12px] leading-4 text-ink-subtle">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12px] leading-4 font-medium text-raspberry-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** Aria props that tie a field to its error message. */
export function fieldAria(id: string, error?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  } as const;
}

/**
 * Show a failed save: problems with a field go under that field, anything else
 * becomes a short message. The dialog stays open with what was typed (GEN-6).
 */
export function showSaveError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
) {
  if (error instanceof ApiError) {
    const known = Object.entries(error.fieldErrors).filter(([field]) => fields.includes(field));
    for (const [field, message] of known) {
      setError(field as Path<T>, { type: "server", message }, { shouldFocus: true });
    }
    if (known.length > 0) return;
    if (error.status < 500 && error.status !== 422) {
      toast.error(error.message);
      return;
    }
  }
  toast.error(messages.saveFailed);
}
