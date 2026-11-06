"""The Copilot's routes: GET /copilot, whether it has a key and the model it asks (Z3, Z19, Z21),
and POST /copilot/chat, which runs one turn and sends what happens as it happens (backend.md).

A turn keeps nothing once it ends. A change card's turn so far goes to the browser in its
pending, and comes back with the person's answer to the card.
"""

import itertools
import json
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from accountable import api, auth
from accountable.copilot import instructions, model, schemas, tools
from accountable.copilot.calls import Caller, NotAnId, OutOfReach, Reply, Route

router = APIRouter(prefix="/copilot")

MOST_REPLIES = 8
"""The most replies in a row the model may give without coming to an answer or a change card (Z20)."""
WHO_AND_WHERE = (Route("GET", "/api/me"), Route("GET", "/api/settings"))
"""What a turn reads for its instructions: the person's name and the company's (Z10)."""
SOMETHING_WENT_WRONG = "Something went wrong."
"""A tool that broke, in the words the app gives for its own crash."""
BROKEN_TOOL = (OutOfReach, NotAnId)
"""A tool that reached past its own routes, or put something that isn't an id in a path, which the caller
refuses before anything is sent. The tool is wrong, so its step fails rather than the turn."""
CRASHES = (LookupError, TypeError, ValueError, AttributeError, ArithmeticError, RuntimeError, httpx.HTTPError)
"""What a tool's own code raises when a reply isn't as it expects, such as a missing key or a value of another
type. Named, since ruff refuses a blind except."""
CHANGED_SINCE = "The records changed after this card was shown, so nothing was changed."
"""A confirmed card that, read again, no longer says what the person saw (Z15)."""
WAITING = (
    "Not done. Each change needs a card of its own, one after another, and the person is answering the card "
    "for an earlier change in this reply. Ask for this one again once they have."
)
"""What the model is told of a change that has to wait for a card of its own (Z14)."""

ModelTransport = Annotated[httpx.AsyncBaseTransport | None, Depends(model.transport)]


def missing_key(request: Request) -> schemas.Problem:
    """Z21's no_key problem, in the words for the copy the backend runs as."""
    local = isinstance(request.app.state.sign_in, auth.LocalSignIn)
    return schemas.Problem(kind="no_key", words=schemas.NO_KEY["local copy" if local else "shared app"])


@router.get("")
def status(request: Request) -> schemas.Status:
    chosen = model.settings()
    return schemas.Status(model=chosen.model, problem=None if chosen.key else missing_key(request))


@router.post("/chat")
async def chat(
    body: schemas.ChatRequest, request: Request, today: api.Today, transport: ModelTransport
) -> StreamingResponse:
    """One turn, as one event a line. It asks the model without holding a lock, so the app keeps answering
    the team meanwhile (W6), and each tool calls the app as the person who asked.

    If the browser goes, as Stop does (Z4), the stream hears it and cancels the turn wherever it's waiting,
    so it asks the model nothing more. A write already handed to one of the app's routes still finishes,
    because the route runs it in a thread, which a cancel waits for."""
    turn = Turn(request, Caller.from_request(request, today), model.settings(), transport)
    return StreamingResponse(turn.events(body), media_type="application/x-ndjson")


@dataclass(frozen=True)
class Waiting:
    """The change a card is about to ask about."""

    call: model.ToolCall
    checked: tools.Checked[Any]
    card: tools.Card


class Turn:
    """One turn of the conversation: from the person's message, or their answer to a change card,
    to the Copilot's answer, a change card or a problem."""

    def __init__(
        self, request: Request, caller: Caller, chosen: model.Settings, transport: httpx.AsyncBaseTransport | None
    ) -> None:
        self.request = request
        self.caller = caller
        self.chosen = chosen
        self.transport = transport
        self.said: list[dict[str, Any]] = []
        """The turn's model messages so far, in OpenAI's chat format: the model's, and each tool's result."""
        self.waiting: Waiting | None = None
        self._step_ids = (f"step-{number}" for number in itertools.count(1))

    async def events(self, body: schemas.ChatRequest) -> AsyncIterator[str]:
        """The turn's events. A tool that crashes on something it didn't expect ends the stream cleanly, without
        a last event, so the panel says "Something went wrong." (Z21). Left to escape, the crash would cut the
        connection, which the browser takes for the backend being gone."""
        try:
            async for event in self._events(body):
                yield event
        except CRASHES:
            return

    async def _events(self, body: schemas.ChatRequest) -> AsyncIterator[str]:
        if self.chosen.key is None:
            yield schemas.line(schemas.error(missing_key(self.request)))
            return
        if body.pending is not None:
            if body.decision == "cancel":
                # Nothing runs, and the model isn't asked again (Z16).
                yield schemas.line(schemas.OutcomeEvent(words=schemas.CANCELLED))
                return
            checked = _confirmable(body.pending.call)
            if isinstance(checked, tools.Refused):
                yield schemas.line(schemas.OutcomeEvent(words=f"{checked.words} Nothing was changed."))
                return
            self.said = list(body.pending.turn)
            async for event in self._make(body.pending, checked):
                yield event
        async for event in self._ask(body.messages):
            yield event

    async def _make(self, pending: schemas.Pending, checked: tools.Checked[Any]) -> AsyncIterator[str]:
        """The change the person confirmed, run once, as them (Z15). The model is told how it went: a change
        made comes with the step's words, since the record's data alone doesn't say it was made, and the model
        would answer that it's still waiting for the person to confirm."""
        step = next(self._step_ids)
        yield _running(step, checked)
        outcome = await self._run_as_shown(checked, pending.shown)
        yield _finished(step, outcome)
        if isinstance(outcome, tools.Done):
            link, told = outcome.link, {"done": outcome.words, **outcome.told}
        else:
            link, told = None, outcome.told
        yield schemas.line(schemas.OutcomeEvent(words=outcome.words, link=link))
        self._tell(pending.call.id, told)

    async def _ask(self, messages: Sequence[schemas.Message]) -> AsyncIterator[str]:
        """Asks the model until it answers or asks for a change, at most 8 times in a row (Z20)."""
        conversation = [await self._instructions(), *({"role": each.role, "content": each.text} for each in messages)]
        async with httpx.AsyncClient(transport=self.transport) as client:
            for _ in range(MOST_REPLIES):
                try:
                    reply = await model.ask(client, self.chosen, [*conversation, *self.said], tools.offered())
                except model.Failed as failed:
                    yield schemas.line(schemas.error(schemas.problem(failed.kind)))
                    return
                if isinstance(reply, model.Answer):
                    yield schemas.line(schemas.AnswerEvent(text=reply.text))
                    return
                self.said.append(reply.message)
                async for event in self._answer(reply.calls):
                    yield event
                if self.waiting is not None:
                    yield schemas.line(self._card_event(self.waiting))
                    return
        yield schemas.line(schemas.error(schemas.problem("too_many_steps")))

    async def _instructions(self) -> dict[str, str]:
        """The instructions, with the person's and the company's names read as the person (Z10)."""
        reader = self.caller.limited_to(WHO_AND_WHERE)
        me, company = await reader.get("/api/me"), await reader.get("/api/settings")
        content = instructions.for_turn(
            person=_text(me, "name"), company=_text(company, "company_name"), today=self.caller.today
        )
        return {"role": "system", "content": content}

    async def _answer(self, calls: Sequence[model.ToolCall]) -> AsyncIterator[str]:
        """Each call in the model's reply, in order. A look-up runs at once. The first change becomes the card,
        and any other change waits for a card of its own (Z14). A call that isn't on the list, or whose arguments
        its schema refuses, reaches nothing, and the model is told why."""
        for call in calls:
            checked = tools.check(call.name, call.arguments)
            if isinstance(checked, tools.Refused):
                self._tell(call.id, checked.told)
            elif checked.tool.kind == "look-up":
                async for event in self._look_up(call, checked):
                    yield event
            elif self.waiting is None:
                async for event in self._prepare(call, checked):
                    yield event
            else:
                self._tell(call.id, {"waiting": WAITING})

    async def _look_up(self, call: model.ToolCall, checked: tools.Checked[Any]) -> AsyncIterator[str]:
        step = next(self._step_ids)
        yield _running(step, checked)
        outcome = await self._run(checked)
        yield _finished(step, outcome)
        self._tell(call.id, outcome.told)

    async def _prepare(self, call: model.ToolCall, checked: tools.Checked[Any]) -> AsyncIterator[str]:
        """The change's card, read as the person. A refused card, such as for a deal that's gone, shows as a
        failed step, and the model is told why, so a later change in the reply may have the card instead."""
        card = await self._card(checked)
        if isinstance(card, tools.Card):
            self.waiting = Waiting(call=call, checked=checked, card=card)
            return
        step = next(self._step_ids)
        yield _running(step, checked)
        yield _finished(step, card)
        self._tell(call.id, card.told)

    async def _run_as_shown(self, checked: tools.Checked[Any], shown: str) -> tools.Done | tools.Refused:
        """The change, once its card, read again from the records, still says what the person saw. A record
        it shows may have changed since, such as a deal moved or a follow-up marked done in another tab."""
        card = await self._card(checked)
        if isinstance(card, tools.Refused):
            return card
        if card.fingerprint != shown:
            return tools.Refused(CHANGED_SINCE)
        return await self._run(checked)

    async def _run(self, checked: tools.Checked[Any]) -> tools.Done | tools.Refused:
        try:
            return await checked.tool.run(self.caller.limited_to(checked.tool.routes), checked.arguments)
        except BROKEN_TOOL:
            return tools.Refused(SOMETHING_WENT_WRONG)

    async def _card(self, checked: tools.Checked[Any]) -> tools.Card | tools.Refused:
        tool = checked.tool
        if tool.card is None:
            return tools.Refused(SOMETHING_WENT_WRONG)
        try:
            return await tool.card(self.caller.limited_to(tool.routes), checked.arguments)
        except BROKEN_TOOL:
            return tools.Refused(SOMETHING_WENT_WRONG)

    def _card_event(self, waiting: Waiting) -> schemas.ChangeEvent:
        """The change card, whose pending holds the turn so far and the one call it waits on."""
        call, card, tool = waiting.call, waiting.card, waiting.checked.tool
        pending = schemas.Pending(
            turn=self.said,
            call=schemas.Call(id=call.id, tool=call.name, arguments=json.loads(call.arguments)),
            shown=card.fingerprint,
        )
        return schemas.ChangeEvent(
            title=card.title, fields=card.fields, note=card.note, button=tool.button or "", pending=pending
        )

    def _tell(self, call_id: str, told: Mapping[str, Any]) -> None:
        """A tool's result, as the model reads it: data, kept apart from its instructions (Z17)."""
        self.said.append({"role": "tool", "tool_call_id": call_id, "content": json.dumps(told, default=str)})


def _confirmable(call: schemas.Call) -> tools.Checked[Any] | tools.Refused:
    """The call a confirmed card holds, checked again as any call is: one of the changes, with arguments
    its schema accepts (Z14). pending comes back from the browser, so it may not be as it was sent."""
    checked = tools.check(call.tool, call.arguments)
    if isinstance(checked, tools.Checked) and checked.tool.kind != "change":
        return tools.Refused(f"{call.tool} isn't a change.")
    return checked


def _running(step: str, checked: tools.Checked[Any]) -> str:
    """A step as it starts, in words written from the tool and its arguments (Z5)."""
    words = checked.tool.running(checked.arguments)
    return schemas.line(schemas.StepEvent(id=step, words=words, state="running"))


def _finished(step: str, outcome: tools.Done | tools.Refused) -> str:
    if isinstance(outcome, tools.Done):
        return schemas.line(schemas.StepEvent(id=step, words=outcome.words, state="done", link=outcome.link))
    return schemas.line(schemas.StepEvent(id=step, words=outcome.words, state="failed"))


def _text(reply: Reply, name: str) -> str | None:
    """A name from a reply, or None when it couldn't be read or there's none."""
    data = reply.data if reply.ok else None
    value = data.get(name) if isinstance(data, dict) else None
    return value if isinstance(value, str) and value.strip() else None
