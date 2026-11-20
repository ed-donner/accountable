import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickerOption = { id: number; name: string; hint?: string | null };

type PickerProps = {
  id: string;
  options: PickerOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  clearLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

/** A searchable list, built from Popover and Command (spec 2.5, forms). */
export function Picker({
  id,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  clearLabel,
  disabled,
  invalid,
  describedBy,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.id === value);

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-options`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(
              fieldClasses,
              "flex h-10 items-center justify-between gap-2 text-left",
              !chosen && "text-ink-subtle",
            )}
          >
            <span className="truncate">{chosen ? chosen.name : placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent id={`${id}-options`} className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {clearLabel && value !== null && (
                  <CommandItem
                    value="__clear__"
                    keywords={[clearLabel]}
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <X className="size-4 text-ink-subtle" aria-hidden />
                    <span className="text-ink-muted">{clearLabel}</span>
                  </CommandItem>
                )}
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={String(option.id)}
                    keywords={[option.name, option.hint ?? ""]}
                    onSelect={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", option.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="truncate">{option.name}</span>
                    {option.hint && <span className="ml-auto truncate text-[12px] text-ink-subtle">{option.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
