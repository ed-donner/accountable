import { ArrowRight, Mail, Phone, StickyNote } from "lucide-react";

type Kind = "note" | "call" | "email" | "stage";

const ICONS = { note: StickyNote, call: Phone, email: Mail, stage: ArrowRight };
const LABELS = {
  note: "Note",
  call: "Call",
  email: "Email",
  stage: "Stage change",
};

export function ActivityIcon({ kind }: { kind: Kind }) {
  const Icon = ICONS[kind];
  return (
    <span className={`li-icon ${kind === "stage" ? "stage" : ""}`} title={LABELS[kind]}>
      <Icon size={16} aria-hidden="true" />
      <span className="sr-only">{LABELS[kind]}</span>
    </span>
  );
}
