import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";

export type PickerOption = { id: number; name: string; hint?: string | null };

type Props = {
  id?: string;
  label: string;
  /** What this picker chooses, for "Add organization" and "Search organizations". */
  noun: string;
  value: number | null;
  options: PickerOption[];
  /** Shown when nothing is chosen. A blank link reads "None". */
  placeholder?: string;
  invalid?: boolean;
  onChange: (id: number) => void;
  onAdd?: (name: string) => void;
};

const VISIBLE = 50;

export function RecordPicker({ id, label, noun, value, options, placeholder, invalid, onChange, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    const found = wanted ? options.filter((option) => option.name.toLowerCase().includes(wanted)) : options;
    return found.slice(0, VISIBLE);
  }, [options, search]);

  const selected = options.find((option) => option.id === value);

  function choose(chosen: number) {
    onChange(chosen);
    setOpen(false);
    setSearch("");
  }

  function add() {
    setOpen(false);
    onAdd?.(search.trim());
    setSearch("");
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-invalid={invalid}
          className="input flex items-center justify-between gap-2 text-left"
        >
          <span className={`truncate ${selected ? "" : "text-muted"}`}>
            {selected?.name ?? placeholder ?? "Choose"}
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" className="flex-none text-muted" />
        </button>
      </Popover.Trigger>
      {/* Kept inside the dialog: portaled out of it, the list can't be scrolled with a wheel. */}
      <Popover.Content
        align="start"
        sideOffset={4}
        className="z-50 w-[var(--radix-popover-trigger-width)] rounded-card bg-panel p-1.5 shadow-[0_8px_28px_rgba(7,59,76,0.2)]"
      >
        <Command shouldFilter={false} label={label}>
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder={`Search ${noun}s`}
            className="input h-9"
          />
          <Command.List className="mt-1 max-h-[220px] overflow-y-auto">
            {matches.map((option) => (
              <Command.Item
                key={option.id}
                value={String(option.id)}
                onSelect={() => choose(option.id)}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 data-[selected=true]:bg-page"
              >
                <span className="min-w-0 truncate">
                  {option.name}
                  {option.hint && <span className="ml-2 text-[13px] text-muted">{option.hint}</span>}
                </span>
                {option.id === value && <Check size={15} aria-hidden="true" className="flex-none" />}
              </Command.Item>
            ))}
            {matches.length === 0 && (
              <>
                <p className="px-2.5 py-1.5 text-[13px] text-muted">No {noun}s match.</p>
                {onAdd && (
                  <Command.Item
                    value="add"
                    onSelect={add}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold data-[selected=true]:bg-page"
                  >
                    <Plus size={15} aria-hidden="true" />
                    {search.trim() ? `Add "${search.trim()}"` : `Add ${noun}`}
                  </Command.Item>
                )}
              </>
            )}
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover.Root>
  );
}
