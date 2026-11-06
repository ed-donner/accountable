"""The Copilot's request and its events, GET /copilot's reply, the words for what can go wrong
(Z20, Z21), and the messages for its fields.

POST /copilot/chat streams the events, one JSON object a line, as `line` writes them. The
frontend's copilot/queries.ts has the same types, and shared/copilot-cases.json an example
of each, which both sides' tests read.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from accountable import api

MOST_MESSAGES = 20
"""The conversation's last 20 messages, the person's and the Copilot's answers (Z7)."""
LONGEST_QUESTION = 2_000
LONGEST_ANSWER = 10_000

FIELD_MESSAGES = {
    "messages": f"Send from 1 to {MOST_MESSAGES} messages",
    "role": "Use user or assistant",
    "text": f"Write from 1 to {LONGEST_QUESTION:,} characters",
    "decision": "Answer confirm or cancel",
    "pending": "Send the change card's pending as it came",
}
# These rules depend on another field, so their words can't be found by the field's name alone.
ANSWER_TEXT = f"The Copilot's message holds from 1 to {LONGEST_ANSWER:,} characters"
ENDS_WITH_THE_PERSON = "End with the person's message"
DECISION_WITH_PENDING = "Send a decision and the change card's pending together"

CANCELLED = "Cancelled. Nothing was changed."
"""The outcome of a change card's Cancel, which ends the turn without asking the model (Z16)."""

Role = Literal["user", "assistant"]
Decision = Literal["confirm", "cancel"]
StepState = Literal["running", "done", "failed"]
FieldKind = Literal["text", "money", "date", "percent"]
"""How a card's field is shown: money, dates and percentages in JetBrains Mono, the rest as text."""
ProblemKind = Literal[
    "no_key",
    "key_refused",
    "no_credits",
    "minute_limit",
    "day_limit",
    "busy",
    "no_tools",
    "offline",
    "too_slow",
    "unreadable",
    "too_many_steps",
]

NO_KEY = {
    "local copy": "The Copilot needs an OpenRouter key. Add OPENROUTER_API_KEY to .env, then start Accountable again.",
    "shared app": (
        "The Copilot needs an OpenRouter key. Add OPENROUTER_API_KEY to the service's environment on Render."
    ),
}
"""Z21's words for a missing key, which differ by the copy the backend runs as."""

PROBLEMS: dict[ProblemKind, str] = {
    "key_refused": "OpenRouter didn't accept the key. Check OPENROUTER_API_KEY.",
    "no_credits": "The OpenRouter account has run out of credits for this model.",
    "minute_limit": "The Copilot has reached OpenRouter's limit for this minute. Wait a minute and try again.",
    "day_limit": (
        "The Copilot has used today's free requests on OpenRouter. "
        "Try again tomorrow, or add credits to the OpenRouter account."
    ),
    "busy": "The model is busy right now. Wait a minute and try again.",
    "no_tools": "The model in OPENROUTER_MODEL can't use tools. Choose another model.",
    "offline": "Can't reach OpenRouter. Check your internet connection.",
    "too_slow": "The model took too long to answer. Try again.",
    "unreadable": "The model's reply couldn't be read. Try again.",
    "too_many_steps": "The Copilot stopped after 8 steps without an answer. Try asking something narrower.",
}
"""Z21's and Z20's words for every kind but no_key, whose words are in NO_KEY. The panel holds none of them."""


# The request


class Message(api.Request):
    """One message of the conversation: the person's question or request, or the Copilot's answer."""

    role: Role
    text: str

    @field_validator("text")
    @classmethod
    def _fits(cls, text: str, info: ValidationInfo) -> str:
        """Checked once the role is known, since the Copilot's answers may be longer than a question."""
        answer = info.data.get("role") == "assistant"
        if not text.strip() or len(text) > (LONGEST_ANSWER if answer else LONGEST_QUESTION):
            raise ValueError(ANSWER_TEXT if answer else FIELD_MESSAGES["text"])
        return text


class Call(api.Request):
    """The one change a card is waiting on, as the model asked for it."""

    id: Annotated[str, Field(min_length=1, max_length=200)]
    """The model's id for the call, which the tool's result is sent back under."""
    tool: Annotated[str, Field(min_length=1, max_length=100)]
    arguments: dict[str, Any]
    """As the model gave them. The backend checks them against the tool's schema again before it runs (Z14)."""


class Pending(api.Request):
    """A change card's turn so far, which the browser keeps and sends back with the person's answer."""

    turn: list[dict[str, Any]]
    """The turn's model messages so far, in OpenAI's chat format: the model's, with their tool calls,
    and each tool's result. Sent back to the model as it came."""
    call: Call
    shown: Annotated[str, Field(min_length=1, max_length=100)]
    """A digest of the card's words as the person saw them. A confirm runs the change only if the card,
    read again from the records, still says the same (Z15)."""


class ChatRequest(api.Request):
    """POST /copilot/chat's body. decision and pending come first, so the rules on messages can see them."""

    decision: Decision | None = None
    pending: Annotated[Pending | None, Field(validate_default=True)] = None
    messages: Annotated[list[Message], Field(min_length=1, max_length=MOST_MESSAGES)]

    @field_validator("pending")
    @classmethod
    def _with_its_decision(cls, pending: Pending | None, info: ValidationInfo) -> Pending | None:
        # A decision that was refused has its own message already.
        if "decision" in info.data and (info.data["decision"] is None) != (pending is None):
            raise ValueError(DECISION_WITH_PENDING)
        return pending

    @field_validator("messages")
    @classmethod
    def _ends_with_the_person(cls, messages: list[Message], info: ValidationInfo) -> list[Message]:
        """The person asks last, unless this request answers a change card."""
        if info.data.get("decision") is None and messages[-1].role != "user":
            raise ValueError(ENDS_WITH_THE_PERSON)
        return messages


# The events


class CardField(BaseModel):
    """One field a change sets, as the card shows it: "Stage: from Proposal to Negotiation"."""

    name: str
    now: str | None
    """What it is now, in words the backend writes, such as "$48,000" or "Nov 30, 2026", or None for a new record."""
    after: str
    kind: FieldKind


class StepEvent(BaseModel):
    """A tool the Copilot uses (Z5), sent as it starts, then again with the same id once it's done or failed."""

    type: Literal["step"] = "step"
    id: str
    """Unique within its stream. The frontend matches a step's second event to its first by it."""
    words: str
    """Written by the backend from the tool and its arguments, never by the model. A failed step's words say why."""
    state: StepState
    link: str | None = None
    """The page of the record it read or changed, such as /deals/12."""


class ChangeEvent(BaseModel):
    """A change card (Z13), which ends the stream and waits for the person's answer."""

    type: Literal["change"] = "change"
    title: str
    fields: list[CardField]
    note: str | None
    """What else changes by S1, such as "The close date becomes today.", or None."""
    button: str
    """The change's own button, from Z11's table, such as "Move deal"."""
    pending: Pending


class OutcomeEvent(BaseModel):
    """What a confirmed or cancelled change did, which the card shows in place of its buttons (Z15, Z16).
    After a cancel, the stream ends. After a confirm, the turn carries on."""

    type: Literal["outcome"] = "outcome"
    words: str
    link: str | None = None


class AnswerEvent(BaseModel):
    """The model's answer, which ends the stream."""

    type: Literal["answer"] = "answer"
    text: str


class Problem(BaseModel):
    """What went wrong, in Z21's or Z20's words."""

    kind: ProblemKind
    words: str


class ErrorEvent(Problem):
    """A problem in place of the answer, which ends the stream."""

    type: Literal["error"] = "error"


Event = StepEvent | ChangeEvent | OutcomeEvent | AnswerEvent | ErrorEvent


def line(event: Event) -> str:
    """One event as the stream sends it: a JSON object and a newline."""
    return event.model_dump_json() + "\n"


def problem(kind: ProblemKind) -> Problem:
    """A problem of any kind but no_key, whose words depend on the copy, so router.py's missing_key gives it."""
    return Problem(kind=kind, words=PROBLEMS[kind])


def error(problem: Problem) -> ErrorEvent:
    """The event that ends a stream with this problem."""
    return ErrorEvent(kind=problem.kind, words=problem.words)


# GET /copilot


class Status(BaseModel):
    """Whether the Copilot has a key, and the model it asks (Z3, Z19, Z21). Never the key itself."""

    model: str
    problem: Problem | None
