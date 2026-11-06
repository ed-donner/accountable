import { ArrowUp, CircleAlert, Square, SquarePen, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";

import { AnswerText } from "./AnswerText";
import { ChangeCard } from "./ChangeCard";
import { LONGEST_QUESTION, type Conversation, type CopilotStatus, type Entry } from "./queries";
import { Step } from "./Step";

/** The panel's id, which the Copilot button names while the panel is open. */
export const PANEL_ID = "copilot-panel";

const EXAMPLES = ["Which deals close this month?", "What do customers owe us?", "Move a deal to Negotiation"];
const ASK = "Ask a question or for a change";
/** How near the end still counts as reading the newest, so a fraction of a pixel never unpins it. */
const NEAR_END = 24;
/** The closing slide's keyframes in styles.css. */
const SLIDE_OUT = "slide-out";

/**
 * Keeps the newest in view as entries arrive, unless the person has scrolled up to read (Copilot
 * panel). pin() brings it back, as sending a message does.
 */
function useNewestInView(entries: Entry[]) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [entries]);

  function onScroll() {
    const box = scroller.current!;
    pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight <= NEAR_END;
  }

  function pin() {
    pinned.current = true;
  }

  return { scroller, onScroll, pin };
}

/** Escape from anything inside the panel closes it (Z1). The panel is a region, not a control, so it listens itself. */
function useCloseOnEscape(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const element = panel.current!;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) onClose();
    };
    element.addEventListener("keydown", closeOnEscape);
    return () => element.removeEventListener("keydown", closeOnEscape);
  }, [panel, onClose]);
}

/**
 * Calls onGone once the closing panel has slid out, so it can be taken out of the page. With no slide to
 * wait for, as under reduced motion, it calls it at once.
 */
function useGoneOnceOut(panel: RefObject<HTMLElement | null>, leaving: boolean, onGone: () => void) {
  useLayoutEffect(() => {
    if (!leaving) return;
    const element = panel.current!;
    if (getComputedStyle(element).animationName !== SLIDE_OUT) {
      onGone();
      return;
    }
    // Only the panel's own slide out, not an animation inside it whose end bubbles up.
    const slidOut = (event: AnimationEvent) => {
      if (event.target === element && event.animationName === SLIDE_OUT) onGone();
    };
    element.addEventListener("animationend", slidOut);
    return () => element.removeEventListener("animationend", slidOut);
  }, [panel, leaving, onGone]);
}

/** Z21's or Z20's words, which only the backend holds, and Try again where it can help. */
function Problem({ words, onRetry }: { words: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="flex gap-2">
        <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none text-raspberry-text" />
        <span className="min-w-0">{words}</span>
      </p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** What the Copilot can do, three examples and where questions go, before the first message (Z3). */
function Intro({ status, onExample }: { status: CopilotStatus | undefined; onExample: (text: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>
        The Copilot can look up anything in Accountable, and add or change organizations, contacts, deals and
        activities. It asks before changing anything.
      </p>
      <div className="flex flex-col items-start gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="btn btn-secondary" onClick={() => onExample(example)}>
            {example}
          </button>
        ))}
      </div>
      {status && (
        <p className="text-muted">
          Questions, and the records the Copilot reads to answer them, go to{" "}
          <span className="font-mono">{status.model}</span> through OpenRouter. It can get things wrong, so check
          anything important on its page.
        </p>
      )}
      {status?.problem && (
        <div role="alert">
          <Problem words={status.problem.words} />
        </div>
      )}
    </div>
  );
}

type EntryProps = {
  entry: Entry;
  isLast: boolean;
  conversation: Conversation;
  andThen: (action: () => void) => () => void;
};

function EntryView({ entry, isLast, conversation, andThen }: EntryProps) {
  switch (entry.kind) {
    case "message":
      return (
        <p className="ml-auto max-w-[85%] rounded-card bg-page px-3 py-2 break-words whitespace-pre-wrap">
          {entry.text}
        </p>
      );
    case "step":
      return <Step step={entry} />;
    case "answer":
      return <AnswerText text={entry.text} />;
    case "change":
      return (
        <ChangeCard entry={entry} onConfirm={andThen(conversation.confirm)} onCancel={andThen(conversation.cancel)} />
      );
    case "problem": {
      // Try again sends the message before the last problem, so only the last offers it.
      const canRetry = entry.canRetry && isLast && !conversation.working;
      return <Problem words={entry.words} onRetry={canRetry ? andThen(conversation.retry) : undefined} />;
    }
  }
}

type Props = {
  conversation: Conversation;
  /** Closed, and sliding out. */
  leaving: boolean;
  onClose: () => void;
  /** Called once a closed panel has slid out. */
  onGone: () => void;
};

/**
 * The Copilot's panel beside the page (Z1 to Z6, Z21), drawing a Conversation it's given. It slides in as
 * it opens, with focus in the message box, and out as it closes, inert while it goes. It never blocks the page.
 */
export function CopilotPanel({ conversation, leaving, onClose, onGone }: Props) {
  const { entries, working, status } = conversation;
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const { scroller, onScroll, pin } = useNewestInView(entries);
  useCloseOnEscape(panel, onClose);
  useGoneOnceOut(panel, leaving, onGone);

  useEffect(() => {
    box.current!.focus();
  }, []);

  const noKey = Boolean(status?.problem);
  const question = text.trim();
  const canSend = !noKey && question !== "";

  /** Every button in the panel leaves focus in the box, so the next question can be typed straight away. */
  const andThen = (action: () => void) => () => {
    action();
    box.current!.focus();
  };

  function send(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend || working) return;
    pin();
    conversation.send(question);
    setText("");
    box.current!.focus();
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  function stop(event: MouseEvent) {
    // Stop takes Send's place under the pointer, so a double click on Send mustn't stop what it sent.
    if (event.detail > 1) return;
    andThen(conversation.stop)();
  }

  function fill(example: string) {
    setText(example);
    box.current!.focus();
  }

  return (
    <section
      id={PANEL_ID}
      ref={panel}
      aria-labelledby={headingId}
      inert={leaving}
      // 12px below the top bar, which is 56px tall and 12px from the top, and in line with its end.
      className={`fixed top-20 right-5 bottom-3 z-30 flex w-[400px] flex-col rounded-panel bg-raised shadow-(--shadow-dialog) ${
        leaving ? "animate-slide-out" : "animate-slide-in"
      }`}
    >
      <div className="flex flex-none items-center gap-1 pt-4 pr-4 pb-2 pl-5">
        <h2 id={headingId} className="mr-auto">
          Copilot
        </h2>
        <button type="button" className="icon-btn" title="New conversation" onClick={andThen(conversation.clear)}>
          <SquarePen size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" title="Close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={scroller}
        role="log"
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-2"
      >
        {entries.length === 0 ? (
          <Intro status={status} onExample={fill} />
        ) : (
          entries.map((entry, index) => (
            <EntryView
              key={entry.key}
              entry={entry}
              isLast={index === entries.length - 1}
              conversation={conversation}
              andThen={andThen}
            />
          ))
        )}
      </div>
      <form onSubmit={send} className="flex flex-none items-end gap-2 px-5 pt-2 pb-5">
        <textarea
          ref={box}
          aria-label={ASK}
          placeholder={ASK}
          maxLength={LONGEST_QUESTION}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={sendOnEnter}
          // Grows with what's typed up to six lines of 20px, then scrolls.
          className="input max-h-[138px] min-h-[38px] min-w-0 flex-1 resize-none field-sizing-content"
        />
        {working ? (
          <button type="button" className="btn btn-secondary" onClick={stop}>
            <Square size={14} aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            <ArrowUp size={16} aria-hidden="true" />
            Send
          </button>
        )}
      </form>
    </section>
  );
}
