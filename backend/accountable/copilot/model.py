"""The model the Copilot asks, through OpenRouter (Z19 to Z21).

The two settings come from the backend's own environment, read each time they're needed,
so they're never kept anywhere a reply could reach. Neither decides which copy runs (C8).

Asking sends the conversation and the tools to OpenRouter's chat completions, waits at most
60 seconds, and turns the reply into the model's answer, the tools it calls, or one of Z21's
kinds, read from OpenRouter's replies as the Copilot's plan records them (Risks). A problem
carries only its kind, so neither the key nor OpenRouter's own words can reach the person.
"""

import json
import os
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import anyio
import httpx

from accountable.copilot.schemas import LONGEST_ANSWER, ProblemKind

DEFAULT_MODEL = "openrouter/free"
"""OpenRouter's router across its free models."""
OPENROUTER = "https://openrouter.ai/api/v1"
SECONDS = 60
"""The longest the Copilot waits for each reply (Z20)."""
LONGEST_CALL_ID = 200
"""The longest call id a change card's pending can carry back (schemas.Call)."""

# What each refusal from OpenRouter means, by its status. A 429 is told apart by what it says.
KINDS_BY_STATUS: dict[int, ProblemKind] = {
    401: "key_refused",
    402: "no_credits",
    # The Copilot always sends tools, so a model with no endpoint that can use them, or no endpoint at all.
    404: "no_tools",
    408: "too_slow",
    502: "busy",
    503: "busy",
    504: "too_slow",
}
LIMITS_BY_SIZE: dict[str, ProblemKind] = {"20": "minute_limit", "50": "day_limit", "1000": "day_limit"}
"""A free key's limits, by X-RateLimit-Limit: 20 a minute, and 50 a day, or 1,000 once credits are bought (Z22)."""


@dataclass(frozen=True)
class Settings:
    key: str | None = field(repr=False)
    """OPENROUTER_API_KEY, or None when it's unset or blank. Left out of the settings' repr, so no log can show it."""
    model: str
    """OPENROUTER_MODEL, or openrouter/free when it's unset or blank."""
    url: str
    """Where chat completions are asked for, without a slash at its end: OpenRouter's API, or
    ACCOUNTABLE_MODEL_URL when that's set, which points the tests at a stand-in (Testing)."""


def settings() -> Settings:
    return Settings(
        key=_setting("OPENROUTER_API_KEY") or None,
        model=_setting("OPENROUTER_MODEL") or DEFAULT_MODEL,
        url=(_setting("ACCOUNTABLE_MODEL_URL") or OPENROUTER).rstrip("/"),
    )


def _setting(name: str) -> str:
    return os.environ.get(name, "").strip()


# What the model replies


@dataclass(frozen=True)
class ToolCall:
    id: str
    """The model's id for the call, which the tool's result goes back under."""
    name: str
    arguments: str
    """As the model wrote them, as JSON text, which tools.check reads."""


@dataclass(frozen=True)
class Answer:
    """The model's answer, which ends the turn."""

    text: str


@dataclass(frozen=True)
class ToolCalls:
    """The tools the model asks to use, in order."""

    calls: tuple[ToolCall, ...]
    content: str | None = None
    """Anything the model wrote beside its calls. The person never sees it (Z5), but the model keeps it."""

    @property
    def message(self) -> dict[str, Any]:
        """The model's message as the turn keeps it, in OpenAI's chat format."""
        return {
            "role": "assistant",
            "content": self.content,
            "tool_calls": [
                {"id": call.id, "type": "function", "function": {"name": call.name, "arguments": call.arguments}}
                for call in self.calls
            ],
        }


class Failed(Exception):
    """Asking went wrong, in one of Z21's kinds."""

    def __init__(self, kind: ProblemKind) -> None:
        super().__init__(kind)
        self.kind: ProblemKind = kind


# Asking


def transport() -> httpx.AsyncBaseTransport | None:
    """How the backend reaches the model. None is httpx's own way, over the internet, which follows the
    computer's proxy settings as a transport given here wouldn't. The tests stand a model in here instead."""
    return None


async def ask(
    client: httpx.AsyncClient,
    chosen: Settings,
    messages: Sequence[Mapping[str, Any]],
    tools: Sequence[Mapping[str, Any]],
) -> Answer | ToolCalls:
    """The model's reply to the conversation so far, offered these tools, or Failed with what went wrong."""
    if chosen.key is None:
        raise ValueError("The model is asked only with a key")
    if not (chosen.key.isascii() and chosen.key.isprintable()):
        # Such a key can't go in a header, and OpenRouter would refuse it anyway.
        raise Failed("key_refused")
    try:
        with anyio.fail_after(SECONDS):
            reply = await client.post(
                f"{chosen.url}/chat/completions",
                headers={"authorization": f"Bearer {chosen.key}"},
                json={"model": chosen.model, "messages": list(messages), "tools": list(tools)},
                timeout=SECONDS,
            )
    except (TimeoutError, httpx.TimeoutException):
        raise Failed("too_slow") from None
    except (httpx.NetworkError, httpx.ProxyError):
        raise Failed("offline") from None
    except (httpx.HTTPError, httpx.InvalidURL):
        raise Failed("unreadable") from None
    return _read(reply)


def _read(reply: httpx.Response) -> Answer | ToolCalls:
    body = _json(reply)
    problem = _error_in(body)
    if not reply.is_success:
        raise Failed(_kind(reply.status_code, problem, reply.headers))
    if problem is not None:
        # Once a host has taken the request, the status stays 200, and the error's code stands in for it.
        raise Failed(_kind(_code(problem), problem, reply.headers))
    message = _message(body)
    if message is None:
        raise Failed("unreadable")
    content = message.get("content")
    said = _plain(content).strip() if isinstance(content, str) else ""
    if message.get("tool_calls"):
        return ToolCalls(calls=_calls(message["tool_calls"]), content=said or None)
    if not said:
        raise Failed("unreadable")
    # The conversation sends the answer back with its next question, so it has to fit the request.
    return Answer(said[:LONGEST_ANSWER])


def _json(reply: httpx.Response) -> Any:
    try:
        return reply.json()
    except ValueError:
        return None


def _first_choice(body: Any) -> Mapping[str, Any] | None:
    choices = body.get("choices") if isinstance(body, Mapping) else None
    if isinstance(choices, list) and choices and isinstance(choices[0], Mapping):
        return choices[0]
    return None


def _error_in(body: Any) -> Mapping[str, Any] | None:
    """The error a reply carries: in the body, or beside a choice that finished with one."""
    if isinstance(body, Mapping) and isinstance(body.get("error"), Mapping):
        return body["error"]
    choice = _first_choice(body)
    if choice is not None and choice.get("finish_reason") == "error":
        return choice["error"] if isinstance(choice.get("error"), Mapping) else {}
    return None


def _message(body: Any) -> Mapping[str, Any] | None:
    choice = _first_choice(body)
    message = choice.get("message") if choice is not None else None
    return message if isinstance(message, Mapping) else None


def _code(problem: Mapping[str, Any]) -> int:
    """The error's code, which OpenRouter gives as the status it stands for, or 0 when it gives none."""
    code = problem.get("code")
    if isinstance(code, str) and code.isdigit():
        return int(code)
    return code if type(code) is int else 0


def _kind(status: int, problem: Mapping[str, Any] | None, headers: Mapping[str, str]) -> ProblemKind:
    if status == 429:
        return _which_limit(problem or {}, headers)
    return KINDS_BY_STATUS.get(status, "unreadable")


def _which_limit(problem: Mapping[str, Any], headers: Mapping[str, str]) -> ProblemKind:
    """The day's limit or the minute's, by what the reply says, and the model's host busy when it can't tell."""
    message = str(problem.get("message", ""))
    if "free-models-per-day" in message:
        return "day_limit"
    if "free-models-per-min" in message:
        return "minute_limit"
    size = headers.get("x-ratelimit-limit") or _limit_in(problem)
    return LIMITS_BY_SIZE.get(str(size).strip(), "busy")


def _limit_in(problem: Mapping[str, Any]) -> Any:
    """X-RateLimit-Limit as the error's metadata repeats the headers, whatever their case."""
    metadata = problem.get("metadata")
    headers = metadata.get("headers") if isinstance(metadata, Mapping) else None
    if not isinstance(headers, Mapping):
        return None
    return next((value for name, value in headers.items() if str(name).lower() == "x-ratelimit-limit"), None)


def _calls(made: Any) -> tuple[ToolCall, ...]:
    if not isinstance(made, list):
        raise Failed("unreadable")
    calls: list[ToolCall] = []
    for each in made:
        call = _call(each, taken={call.id for call in calls})
        if call is None:
            raise Failed("unreadable")
        calls.append(call)
    return tuple(calls)


def _call(made: Any, taken: set[str]) -> ToolCall | None:
    """One tool call, with an id of its own. Some models leave the id out, or give two calls the same one."""
    function = made.get("function") if isinstance(made, Mapping) else None
    if not isinstance(function, Mapping) or not isinstance(function.get("name"), str):
        return None
    arguments = function.get("arguments")
    if isinstance(arguments, Mapping):
        arguments = json.dumps(arguments)
    elif arguments is None or (isinstance(arguments, str) and not arguments.strip()):
        arguments = "{}"
    elif not isinstance(arguments, str):
        return None
    given = made.get("id")
    if isinstance(given, str) and given.strip() and len(given) <= LONGEST_CALL_ID and _plain(given) not in taken:
        call_id = _plain(given)
    else:
        call_id = f"call_{secrets.token_hex(8)}"
    return ToolCall(id=call_id, name=_plain(function["name"]), arguments=_plain(arguments))


def _plain(text: str) -> str:
    """The text with no NUL and no half of a two-part character, which a JSON reply can carry,
    but the stream can't send, and the next request would refuse."""
    return text.encode("utf-8", "replace").decode().replace("\x00", "")
