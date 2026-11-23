import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

const FIELD = "input:not([type=hidden]), select, textarea, [data-autofocus]";

/** Focuses the panel's first field, waiting for it if the form is still loading. */
function focusFirstField(panel: HTMLElement): () => void {
  const focusIfReady = () => {
    const field = panel.querySelector<HTMLElement>(FIELD);
    field?.focus();
    return field !== null;
  };
  if (focusIfReady()) return () => {};
  const observer = new MutationObserver(() => {
    if (focusIfReady()) observer.disconnect();
  });
  observer.observe(panel, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/** A form panel that slides in from the right (T4). Escape and Cancel close it. */
export function SidePanel({ title, open, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const stopFocusing = panelRef.current ? focusFirstField(panelRef.current) : undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      stopFocusing?.();
      document.removeEventListener("keydown", onKey);
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    // The backdrop click is a mouse shortcut; Escape and the Close button do the same.
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="side-panel" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        <div className="side-panel-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="side-panel-body">{children}</div>
      </div>
    </div>
  );
}
