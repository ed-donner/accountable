import type { ReactNode } from "react";

type Props = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
};

/** A label above its field, with the error in plain words under it (V3). */
export function Field({ id, label, required, error, hint, children }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span className="error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </div>
  );
}

/** Props that tie an input to its Field's label and error. */
export function fieldProps(id: string, error?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  } as const;
}

/** The message for the whole form, such as a failed save, above its fields. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      {message}
    </div>
  );
}

type FormActionsProps = {
  submitLabel: string;
  submitting: boolean;
  onCancel?: () => void;
};

/** Save and Cancel at the foot of a form. */
export function FormActions({ submitLabel, submitting, onCancel }: FormActionsProps) {
  return (
    <div className="form-actions">
      <button type="submit" className="btn" disabled={submitting}>
        {submitLabel}
      </button>
      <button type="button" className="btn ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
