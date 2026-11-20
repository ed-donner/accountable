// The wording of the delete dialogs and the short messages (spec 1.10, 2.7;
// plan, decision 18).

import { formatLocalDate, plural, pluralNoun } from "./format";
import { STAGE_NAMES, type Stage } from "./rules";

export type DeleteWords = { title: string; lines: string[] };

/** DEL-2: an organization without deals. */
export function organizationDelete(name: string, contacts: number): DeleteWords {
  const lines = contacts > 0 ? [`Its ${plural(contacts, "contact")} will stay, with no organization.`] : [];
  return { title: `Delete ${name}?`, lines };
}

/** DEL-3: an organization with deals can't be deleted. */
export function organizationBlocked(name: string): DeleteWords {
  return {
    title: `${name} can't be deleted`,
    lines: [
      `${name} can't be deleted while it has deals. Move these deals to another organization or delete them first:`,
    ],
  };
}

/** DEL-4: a contact. Uses the contact's name, not a pronoun (spec 2.7). */
export function contactDelete(name: string, activities: number, dealNames: string[]): DeleteWords {
  const lines: string[] = [];
  if (activities > 0) lines.push(`${name}'s ${plural(activities, "activity")} will be deleted.`);
  if (dealNames.length === 1) lines.push(`This deal will stay, with no main contact: ${dealNames[0]}.`);
  if (dealNames.length > 1) lines.push(`These deals will stay, with no main contact: ${dealNames.join(", ")}.`);
  return { title: `Delete ${name}?`, lines };
}

/** DEL-5: a deal. "including its stage changes" appears only when it has some. */
export function dealDelete(name: string, activities: number, stageChanges: number): DeleteWords {
  if (activities === 0) return { title: `Delete ${name}?`, lines: [] };
  const including = stageChanges > 0 ? `, including its ${pluralNoun(stageChanges, "stage change")},` : "";
  return { title: `Delete ${name}?`, lines: [`Its ${plural(activities, "activity")}${including} will be deleted.`] };
}

const TYPE_WORDS: Record<string, string> = { note: "note", call: "call", email: "email" };

/** DEL-6: an activity. "Delete this call from Nov 12, 2026?" */
export function activityDelete(type: string, occurredAt: string): DeleteWords {
  return { title: `Delete this ${TYPE_WORDS[type] ?? "activity"} from ${formatLocalDate(occurredAt)}?`, lines: [] };
}

/** The pipeline band's line: "19 open deals, 3 of them late" (PIPE-3). */
export function pipelineLine(count: number, late: number): string {
  const open = plural(count, "open deal");
  if (late === 0) return open;
  if (count === 1) return `${open}, and it's late`;
  return `${open}, ${late} of them late`;
}

export const messages = {
  added: (kind: "Organization" | "Contact" | "Deal") => `${kind} added`,
  saved: "Changes saved",
  logged: "Activity logged",
  deleted: (kind: "Organization" | "Contact" | "Deal" | "Activity") => `${kind} deleted`,
  saveFailed: "Couldn't save. Try again.",
  deleteFailed: "Couldn't delete. Try again.",
  moveFailed: "Couldn't move the deal. Try again.",
  moved: (stage: Stage) => `Deal moved to ${STAGE_NAMES[stage]}`,
  emptyTimeline: "Nothing logged yet. Log a call, email or note above.",
};
