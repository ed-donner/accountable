import { useEffect, useRef } from "react";
import type { Schemas } from "./api";
import { plural } from "./format";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Asks before deleting, naming the record and what happens to linked records (T6). */
export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const returnTo = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (returnTo instanceof HTMLElement) returnTo.focus();
    };
  }, [onCancel]);

  return (
    <div className="overlay center">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn danger" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- What a delete does, in plain words -------------------------------------

export function organizationDeleteMessage(impact: Schemas["OrganizationImpact"]): string {
  const { name, contacts, deals } = impact;
  if (!contacts && !deals) return `${name} has no contacts or deals. This can't be undone.`;
  const linked = [contacts && plural(contacts, "contact"), deals && plural(deals, "deal")].filter(Boolean).join(" and ");
  return `${name} has ${linked}. They'll be kept, with no organization. This can't be undone.`;
}

export function contactDeleteMessage(impact: Schemas["ContactImpact"]): string {
  const { name, deals, activities } = impact;
  const parts: string[] = [];
  if (deals) parts.push(`${name} is the main contact on ${plural(deals, "deal")}. They'll be kept, with no main contact.`);
  if (activities) parts.push(`${plural(activities, "activity", "activities")} logged on ${name} will be deleted.`);
  if (!parts.length) parts.push(`${name} has no deals or activities.`);
  return `${parts.join(" ")} This can't be undone.`;
}

export function dealDeleteMessage(impact: Schemas["DealImpact"]): string {
  const { name, activities, stage_changes: changes } = impact;
  const linked = [activities && plural(activities, "activity", "activities"), changes && plural(changes, "stage change")]
    .filter(Boolean)
    .join(" and ");
  if (!linked) return `${name} will be deleted. This can't be undone.`;
  return `${name} has ${linked}. They'll be deleted with it. This can't be undone.`;
}
