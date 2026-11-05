import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor?: string;
  error?: string;
  /** Shown under the box in muted ink. An error takes its place while there is one. */
  hint?: string;
  children: ReactNode;
};

/** The id of the line under a box, its hint or its error, for the box's aria-describedby. */
export function messageId(htmlFor: string) {
  return `${htmlFor}-message`;
}

export function Field({ label, htmlFor, error, hint, children }: Props) {
  const id = htmlFor && messageId(htmlFor);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] leading-[18px] font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={id} role="alert" className="text-[13px] leading-[18px] text-raspberry-text">
          {error}
        </p>
      ) : (
        hint && (
          <p id={id} className="text-[13px] leading-[18px] text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
