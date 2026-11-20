import { FileText, Mail, Phone } from "lucide-react";
import type { LoggableType } from "@/api/types";
import { cn } from "@/lib/utils";

const TYPES: { value: LoggableType; label: string; Icon: typeof FileText }[] = [
  { value: "note", label: "Note", Icon: FileText },
  { value: "call", label: "Call", Icon: Phone },
  { value: "email", label: "Email", Icon: Mail },
];

/** Note, Call or Email, as one row of buttons. */
export function TypePicker({ value, onChange }: { value: LoggableType; onChange: (value: LoggableType) => void }) {
  return (
    <div role="radiogroup" aria-label="Type" className="inline-flex w-fit rounded-lg bg-panel p-1 shadow-soft">
      {TYPES.map(({ value: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-150",
            value === option ? "bg-band text-band-ink" : "text-ink-muted hover:bg-accent hover:text-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
