import { FileText, Mail, Phone } from "lucide-react";
import type { LoggableType } from "@/api/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const TYPES: { value: LoggableType; label: string; Icon: typeof FileText }[] = [
  { value: "note", label: "Note", Icon: FileText },
  { value: "call", label: "Call", Icon: Phone },
  { value: "email", label: "Email", Icon: Mail },
];

/**
 * Note, Call or Email, as one row of buttons. Radix's toggle group makes them
 * one stop for Tab, with the arrow keys moving between them.
 */
export function TypePicker({ value, onChange }: { value: LoggableType; onChange: (value: LoggableType) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Clicking the chosen type again would leave none chosen, so that's ignored.
      onValueChange={(next) => next && onChange(next as LoggableType)}
      aria-label="Type"
      className="gap-0 rounded-lg bg-panel p-1 shadow-soft"
    >
      {TYPES.map(({ value: option, label, Icon }) => (
        <ToggleGroupItem
          key={option}
          value={option}
          // The hover rules name the state, so they outrank the toggle's own hover color.
          className="h-8 gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:data-[state=off]:bg-accent hover:data-[state=off]:text-ink data-[state=on]:bg-band data-[state=on]:text-band-ink hover:data-[state=on]:bg-band hover:data-[state=on]:text-band-ink"
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
