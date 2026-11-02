import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, error, children }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] leading-[18px] font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-[13px] leading-[18px] text-raspberry-text">
          {error}
        </p>
      )}
    </div>
  );
}
