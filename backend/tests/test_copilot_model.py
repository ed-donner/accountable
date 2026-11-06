"""Asking OpenRouter, and what each of its replies means (Z19 to Z21).

OpenRouter is stood in for with httpx's MockTransport, which answers with the replies the
Copilot's plan copied from OpenRouter's documentation and from logs of real replies (Risks,
OpenRouter's replies). Nothing here reaches the network, and nothing waits: a slow model is
a transport that times out at once.
"""

import asyncio
import json
from collections.abc import Callable
from typing import Any

import anyio
import httpx
import pytest
from accountable.copilot import model, schemas

MADE_UP_KEY = "made-up-key-for-the-tests"
ADDRESS = "http://stand-in.example/api/v1"
CHOSEN = model.Settings(key=MADE_UP_KEY, model="openrouter/free", url=ADDRESS)
MESSAGES = [
    {"role": "system", "content": "You are the Copilot in Accountable."},
    {"role": "user", "content": "Which deals close this month?"},
]
TOOLS = [{"type": "function", "function": {"name": "search", "description": "Find things", "parameters": {}}}]

Handler = Callable[[httpx.Request], Any]


def asking(handler: Handler, chosen: model.Settings = CHOSEN) -> model.Answer | model.ToolCalls:
    async def ask() -> model.Answer | model.ToolCalls:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await model.ask(client, chosen, MESSAGES, TOOLS)

    return asyncio.run(ask())


def replying(status: int, body: Any, headers: dict[str, str] | None = None) -> Handler:
    def reply(_request: httpx.Request) -> httpx.Response:
        sent = {"content": body} if isinstance(body, bytes) else {"json": body}
        return httpx.Response(status, headers=headers, **sent)

    return reply


def failing(handler: Handler, chosen: model.Settings = CHOSEN) -> str:
    """The kind of problem asking ends with."""
    with pytest.raises(model.Failed) as failed:
        asking(handler, chosen)
    return failed.value.kind


def message(**fields: Any) -> dict[str, Any]:
    """A reply with the model's message, as OpenRouter gives one."""
    return {
        "id": "gen-1",
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", **fields}}],
    }


def tool_call(name: Any, arguments: Any, call_id: Any = "call_1") -> dict[str, Any]:
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": arguments}}


# The request


def test_the_request_carries_the_model_the_messages_the_tools_and_the_key_to_the_address():
    sent: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json=message(content="Two deals."))

    asking(answer, model.Settings(key=MADE_UP_KEY, model="openai/gpt-4o-mini", url=ADDRESS))
    [request] = sent
    assert (request.method, str(request.url)) == ("POST", f"{ADDRESS}/chat/completions")
    assert request.headers["authorization"] == f"Bearer {MADE_UP_KEY}"
    assert json.loads(request.content) == {"model": "openai/gpt-4o-mini", "messages": MESSAGES, "tools": TOOLS}


def test_it_waits_60_seconds_for_a_reply():
    timeouts: list[dict[str, float]] = []

    def answer(request: httpx.Request) -> httpx.Response:
        timeouts.append(request.extensions["timeout"])
        return httpx.Response(200, json=message(content="Two deals."))

    asking(answer)
    assert model.SECONDS == 60
    assert timeouts == [{"connect": 60, "read": 60, "write": 60, "pool": 60}]


def test_a_reply_slower_than_its_time_in_all_is_too_slow(monkeypatch):
    """However its bytes trickle in. The wait is cut to nothing here, so the test doesn't wait."""
    monkeypatch.setattr(model, "SECONDS", 0)

    async def never(_request: httpx.Request) -> httpx.Response:
        await anyio.Event().wait()
        raise AssertionError("never answers")

    assert failing(never) == "too_slow"


def test_a_key_that_cant_go_in_a_header_is_refused_without_asking():
    asked: list[httpx.Request] = []
    with_ellipsis = model.Settings(key="sk-or-v1-abc…", model="openrouter/free", url=ADDRESS)
    assert failing(asked.append, with_ellipsis) == "key_refused"
    assert asked == []


def test_it_is_never_asked_without_a_key():
    with pytest.raises(ValueError):
        asking(replying(200, message(content="Hi")), model.Settings(key=None, model="openrouter/free", url=ADDRESS))


# The answer and the tool calls


def test_a_reply_with_no_tool_calls_is_the_answer():
    reply = asking(replying(200, message(content="  Two deals close this month.\n")))
    assert reply == model.Answer("Two deals close this month.")


def test_a_reply_with_tool_calls_gives_each_with_its_arguments():
    calls = [tool_call("search", '{"text": "acme"}', "call_1"), tool_call("list_deals", "{}", "call_2")]
    reply = asking(replying(200, message(content=None, tool_calls=calls)))
    assert reply == model.ToolCalls(
        calls=(
            model.ToolCall(id="call_1", name="search", arguments='{"text": "acme"}'),
            model.ToolCall(id="call_2", name="list_deals", arguments="{}"),
        )
    )


def test_the_turn_keeps_the_models_message_in_openais_format():
    calls = [tool_call("search", '{"text": "acme"}')]
    reply = asking(replying(200, message(content="Let me look.", tool_calls=calls, reasoning="secret")))
    assert isinstance(reply, model.ToolCalls)
    assert reply.message == {
        "role": "assistant",
        "content": "Let me look.",
        "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": "search", "arguments": '{"text": "acme"}'}}
        ],
    }


@pytest.mark.parametrize(
    "arguments, read",
    [({"text": "acme"}, '{"text": "acme"}'), (None, "{}"), ("", "{}"), ("  ", "{}")],
    ids=["an object", "none", "empty", "spaces"],
)
def test_arguments_given_as_an_object_or_not_at_all_are_json_text(arguments, read):
    reply = asking(replying(200, message(content=None, tool_calls=[tool_call("search", arguments)])))
    assert isinstance(reply, model.ToolCalls)
    assert reply.calls[0].arguments == read


def test_a_call_with_no_id_or_another_calls_id_gets_one_of_its_own():
    calls = [
        tool_call("search", "{}", None),
        tool_call("search", "{}", ""),
        tool_call("search", "{}", "call_0"),
        tool_call("search", "{}", "call_0"),
        tool_call("search", "{}", "c" * 201),
    ]
    reply = asking(replying(200, message(content=None, tool_calls=calls)))
    assert isinstance(reply, model.ToolCalls)
    ids = [call.id for call in reply.calls]
    assert ids[2] == "call_0"
    assert len(set(ids)) == 5
    assert all(0 < len(each) <= 200 for each in ids)


@pytest.mark.parametrize(
    "made",
    [{"id": "call_1", "type": "function"}, tool_call(12, "{}"), tool_call("search", 12), "search", [None]],
    ids=["no function", "a name that isn't text", "arguments that aren't text", "not a call", "a list"],
)
def test_a_call_that_cant_be_read_makes_the_reply_unreadable(made):
    assert failing(replying(200, message(content=None, tool_calls=[made]))) == "unreadable"


def test_tool_calls_that_arent_a_list_are_unreadable():
    assert failing(replying(200, message(content=None, tool_calls={"id": "call_1"}))) == "unreadable"


def test_an_answer_can_go_back_with_the_next_question():
    """The conversation sends it back, and the request refuses a NUL, half a character or over 10,000."""
    body = b'{"choices": [{"message": {"role": "assistant", "content": "Harbor\\u0000 & Pine\\ud800"}}]}'
    assert asking(replying(200, body)) == model.Answer("Harbor & Pine?")
    long = asking(replying(200, message(content="a" * 10_001)))
    assert long == model.Answer("a" * schemas.LONGEST_ANSWER)


def test_a_calls_text_can_go_back_in_a_cards_pending():
    calls = [tool_call("search\u0000", '{"text": "\\ud800"}')]
    body = json.dumps(message(content=None, tool_calls=calls)).replace("\\\\ud800", "\\ud800").encode()
    reply = asking(replying(200, body))
    assert isinstance(reply, model.ToolCalls)
    assert (reply.calls[0].name, reply.calls[0].arguments) == ("search", '{"text": "?"}')


# Each of Z21's kinds, from OpenRouter's replies as the plan records them

KEY_REFUSED = {"error": {"message": "User not found.", "code": 401}}
NO_CREDITS = {
    "error": {
        "code": 402,
        "message": "Insufficient credits. Add more using https://openrouter.ai/settings/credits",
        "metadata": {"limit_source": "openrouter_credits"},
    }
}
NO_TOOLS = {
    "error": {
        "message": (
            "No endpoints found that support tool use. To learn more about provider routing, visit: "
            "https://openrouter.ai/docs/provider-routing"
        ),
        "code": 404,
    }
}
NO_SUCH_MODEL = {"error": {"message": "No endpoints found for openrouter/nothing.", "code": 404}}
DAY_LIMIT = {
    "error": {
        "message": "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
        "code": 429,
        "metadata": {
            "headers": {"X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1766620800000"},
            "provider_name": None,
        },
    }
}
DAY_HEADERS = {"X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1766620800000"}
MINUTE_LIMIT = {
    "error": {
        "message": "Rate limit exceeded: free-models-per-min. ",
        "code": 429,
        "metadata": {
            "headers": {"X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1766620860000"},
            "provider_name": None,
        },
    }
}
UPSTREAM_LIMIT = {
    "error": {
        "code": 429,
        "message": "Rate limit exceeded",
        "metadata": {"error_type": "rate_limit_exceeded", "provider_code": "rate_limited"},
    }
}
UPSTREAM_BUSY = {
    "error": {"code": 429, "message": "openrouter/free is temporarily rate-limited upstream. Please retry shortly."}
}
PROVIDER_FAILED = {
    "id": "gen-1",
    "error": {"code": 502, "message": "Provider returned error", "metadata": {"error_type": "provider_unavailable"}},
}


def limit_without_words(size: str) -> dict[str, Any]:
    """A 429 that names no limit, with only its size in the metadata's headers."""
    return {
        "error": {"code": 429, "message": "Rate limit exceeded", "metadata": {"headers": {"x-ratelimit-limit": size}}}
    }


def finished_with(error: dict[str, Any]) -> dict[str, Any]:
    """A 200 whose choice finished with an error, after a host had taken the request."""
    return {"id": "gen-1", "choices": [{"index": 0, "finish_reason": "error", "error": error, "message": None}]}


REPLIES = {
    "401, a key OpenRouter refuses": (401, KEY_REFUSED, None, "key_refused"),
    "402, no credits": (402, NO_CREDITS, None, "no_credits"),
    "402, the key's own limit": (402, {"error": {"code": 402, "message": "Key limit exceeded"}}, None, "no_credits"),
    "404, a model that can't use tools": (404, NO_TOOLS, None, "no_tools"),
    "404, a model that isn't there": (404, NO_SUCH_MODEL, None, "no_tools"),
    "429, the minute's limit": (429, MINUTE_LIMIT, None, "minute_limit"),
    "429, the day's limit": (429, DAY_LIMIT, DAY_HEADERS, "day_limit"),
    "429, the day's limit once credits are bought": (
        429,
        {"error": {**DAY_LIMIT["error"], "message": "Rate limit exceeded: free-models-per-day"}},
        {**DAY_HEADERS, "X-RateLimit-Limit": "1000"},
        "day_limit",
    ),
    "429 with no words, 20 a minute in its headers": (
        429,
        UPSTREAM_LIMIT,
        {"X-RateLimit-Limit": "20"},
        "minute_limit",
    ),
    "429 with no words, 50 a day in its headers": (429, UPSTREAM_LIMIT, {"X-RateLimit-Limit": "50"}, "day_limit"),
    "429 with no words, 20 a minute in its metadata": (429, limit_without_words("20"), None, "minute_limit"),
    "429 with no words, 1000 a day in its metadata": (429, limit_without_words("1000"), None, "day_limit"),
    "429 from the model's host": (429, UPSTREAM_LIMIT, None, "busy"),
    "429 from the model's host, busy": (429, UPSTREAM_BUSY, None, "busy"),
    "429 with some other limit": (429, limit_without_words("200"), None, "busy"),
    "429 with no body": (429, b"", None, "busy"),
    "502, the model down": (502, {"error": {"code": 502, "message": "Bad gateway"}}, None, "busy"),
    "503, no host free": (503, {"error": {"code": 503, "message": "No available provider"}}, None, "busy"),
    "408, OpenRouter gave up waiting": (408, {"error": {"code": 408, "message": "Timed out"}}, None, "too_slow"),
    "504, the host gave up waiting": (504, b"Gateway Timeout", None, "too_slow"),
    "400, a request it couldn't read": (400, {"error": {"code": 400, "message": "Bad request"}}, None, "unreadable"),
    "403, moderation": (403, {"error": {"code": 403, "message": "Flagged"}}, None, "unreadable"),
    "500": (500, b"<html>Internal Server Error</html>", None, "unreadable"),
    "200 whose body is the host's error": (200, PROVIDER_FAILED, None, "busy"),
    "200 whose body is the day's limit": (200, DAY_LIMIT, None, "day_limit"),
    "200 whose body is the minute's limit": (200, MINUTE_LIMIT, None, "minute_limit"),
    "200 whose body is an error with its code as text": (
        200,
        {"error": {"code": "401", "message": "User not found."}},
        None,
        "key_refused",
    ),
    "200 whose body is an error with no code": (200, {"error": {"message": "Something"}}, None, "unreadable"),
    "200 whose choice finished with the host's error": (
        200,
        finished_with({"code": 502, "message": "Provider returned error"}),
        None,
        "busy",
    ),
    "200 whose choice finished with an error it doesn't give": (
        200,
        {"choices": [{"finish_reason": "error", "message": {"role": "assistant", "content": "Half an answer"}}]},
        None,
        "unreadable",
    ),
    "200 with neither choices nor an error": (200, {"id": "gen-1"}, None, "unreadable"),
    "200 with no choices": (200, {"id": "gen-1", "choices": []}, None, "unreadable"),
    "200 with a choice and no message": (200, {"choices": [{"finish_reason": "stop"}]}, None, "unreadable"),
    "200 that isn't JSON": (200, b"<html>Hello</html>", None, "unreadable"),
    "200 with JSON that isn't an object": (200, b"[1, 2]", None, "unreadable"),
    "200 with an empty answer": (200, message(content=""), None, "unreadable"),
    "200 with an answer of spaces": (200, message(content=" \n "), None, "unreadable"),
    "200 with an answer that isn't text": (200, message(content=[{"type": "text"}]), None, "unreadable"),
}


@pytest.mark.parametrize("name", REPLIES)
def test_each_reply_from_openrouter_is_one_of_z21s_kinds(name):
    status, body, headers, kind = REPLIES[name]
    assert failing(replying(status, body, headers)) == kind


@pytest.mark.parametrize(
    "error, kind",
    [
        (httpx.ConnectError("Connection refused"), "offline"),
        (httpx.ConnectError("nodename nor servname provided, or not known"), "offline"),
        (httpx.ReadError("Connection reset by peer"), "offline"),
        (httpx.ProxyError("Proxy refused"), "offline"),
        (httpx.ConnectTimeout("Timed out connecting"), "too_slow"),
        (httpx.ReadTimeout("Timed out reading"), "too_slow"),
        (httpx.RemoteProtocolError("Server disconnected without sending a response."), "unreadable"),
        (httpx.UnsupportedProtocol("Request URL is missing an 'http://' or 'https://' protocol."), "unreadable"),
    ],
    ids=lambda value: value if isinstance(value, str) else type(value).__name__,
)
def test_not_reaching_openrouter_is_one_of_z21s_kinds(error, kind):
    def fail(request: httpx.Request) -> httpx.Response:
        raise error

    assert failing(fail) == kind


@pytest.mark.parametrize("name", REPLIES)
def test_no_problem_holds_the_key_or_openrouters_own_words(name):
    status, body, headers, _kind = REPLIES[name]
    with pytest.raises(model.Failed) as failed:
        asking(replying(status, body, headers))
    words = schemas.PROBLEMS[failed.value.kind]
    said = json.dumps(body) if isinstance(body, dict) else body.decode()
    error = body.get("error") if isinstance(body, dict) else None
    openrouters = str(error.get("message", "")) if isinstance(error, dict) else said
    assert MADE_UP_KEY not in str(failed.value)
    assert MADE_UP_KEY not in words
    assert not openrouters or openrouters not in words
    assert str(failed.value) == failed.value.kind
