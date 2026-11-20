import { ArrowRight, FileText, Mail, Phone } from "lucide-react";

/** A small round icon for each type: a note, a phone, an envelope, and an arrow for stage changes (spec 2.5). */
export const ACTIVITY_ICONS = { note: FileText, call: Phone, email: Mail, stage_change: ArrowRight };
export const ACTIVITY_NAMES = { note: "Note", call: "Call", email: "Email", stage_change: "Stage change" };
