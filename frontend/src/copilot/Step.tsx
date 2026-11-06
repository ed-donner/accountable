import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Link } from "react-router";

import type { StepEntry, StepState } from "./queries";

const ICON = "mt-0.5 flex-none";

/** An address in the app, such as /deals/12. "//" and "/\" would lead to another site. */
function isAppAddress(link: string) {
  return /^\/(?![/\\])/.test(link);
}

/** The backend's words, as a link to the record's page when there is one. */
export function RecordLink({ words, link }: { words: string; link: string | null }) {
  if (link === null || !isAppAddress(link)) return words;
  return (
    <Link to={link} className="link">
      {words}
    </Link>
  );
}

/** Named, so a screen reader hears whether a step is still running, as the icon shows. */
function StateIcon({ state }: { state: StepState }) {
  if (state === "running") {
    // Still under reduced motion, as everything that moves is (Q3).
    return <LoaderCircle size={16} role="img" aria-label="Running" className={`${ICON} motion-safe:animate-spin`} />;
  }
  if (state === "done") return <Check size={16} role="img" aria-label="Done" className={ICON} />;
  return <CircleAlert size={16} role="img" aria-label="Failed" className={`${ICON} text-raspberry-text`} />;
}

/** A tool the Copilot used, in the backend's words, which for a failed step say why (Z5). */
export function Step({ step }: { step: Pick<StepEntry, "words" | "state" | "link"> }) {
  return (
    <p className="flex gap-2 text-muted">
      <StateIcon state={step.state} />
      <span className="min-w-0">
        <RecordLink words={step.words} link={step.link} />
      </span>
    </p>
  );
}
