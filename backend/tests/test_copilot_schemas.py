"""The Copilot's request, its events, GET /copilot and the model's settings (Z4, Z7, Z19, Z21).

The request's rules come from shared/copilot-cases.json, which the frontend's tests read too.
They're checked against the request's model, with the field messages main.py would give.
"""

import copy
import json
from pathlib import Path
from typing import Any, get_args

import pytest
from accountable import api
from accountable.copilot import model, schemas
from conftest import LOCAL, THIS_COMPUTER
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError

CASES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "copilot-cases.json").read_text())
COPILOT = "/api/copilot"
MADE_UP_KEY = "made-up-key-for-the-tests"
PLAIN_TEXT = "Use plain text here"


def written_out(body: dict[str, Any]) -> dict[str, Any]:
    """The body with each message's text_length turned into that many letters."""
    body = copy.deepcopy(body)
    for message in body.get("messages", []):
        if "text_length" in message:
            message["text"] = "a" * message.pop("text_length")
    return body


def refusals(body: dict[str, Any]) -> dict[str, str]:
    """The fields of the 422 the route would give, as main.py turns a refused body into one."""
    try:
        schemas.ChatRequest.model_validate(body)
    except ValidationError as error:
        errors = [{**problem, "loc": ("body", *problem["loc"])} for problem in error.errors()]
        return api.field_messages(errors, schemas.FIELD_MESSAGES)
    return {}


# The request


@pytest.mark.parametrize("case", CASES["requests"]["accepted"], ids=lambda case: case["name"])
def test_a_good_request_is_accepted(case):
    assert refusals(written_out(case["body"])) == {}


@pytest.mark.parametrize("case", CASES["requests"]["refused"], ids=lambda case: case["name"])
def test_a_bad_request_is_refused_beside_its_field(case):
    assert refusals(written_out(case["body"])) == case["fields"]


def test_every_refusal_has_the_copilots_own_words():
    words = {
        *schemas.FIELD_MESSAGES.values(),
        schemas.ANSWER_TEXT,
        schemas.ENDS_WITH_THE_PERSON,
        schemas.DECISION_WITH_PENDING,
        PLAIN_TEXT,
    }
    used = {said for case in CASES["requests"]["refused"] for said in case["fields"].values()}
    assert used == words


def test_the_limits_are_the_specs():
    assert (schemas.MOST_MESSAGES, schemas.LONGEST_QUESTION, schemas.LONGEST_ANSWER) == (20, 2_000, 10_000)


def test_a_request_keeps_the_texts_as_sent():
    body = {"messages": [{"role": "user", "text": "  Which deals close this month?\n"}]}
    assert schemas.ChatRequest.model_validate(body).messages[0].text == "  Which deals close this month?\n"


def test_pending_comes_back_as_it_was_sent():
    [confirm] = [case for case in CASES["requests"]["accepted"] if case["body"].get("decision") == "confirm"]
    request = schemas.ChatRequest.model_validate(confirm["body"])
    assert request.pending is not None
    assert request.pending.model_dump() == confirm["body"]["pending"]


# The events


EVENTS = TypeAdapter(schemas.Event)


@pytest.mark.parametrize("name", CASES["events"])
def test_each_event_in_the_cases_is_one_the_backend_sends(name):
    sent = CASES["events"][name]
    event = EVENTS.validate_python(sent)
    assert event.type == name
    assert json.loads(schemas.line(event)) == sent


def test_the_cases_have_one_of_each_event():
    models = get_args(schemas.Event)
    assert sorted(CASES["events"]) == sorted(event.model_fields["type"].default for event in models)


def test_an_event_is_one_line_of_json():
    sent = schemas.line(schemas.AnswerEvent(text="First line.\n\nSecond line."))
    assert sent.endswith("\n")
    assert sent.count("\n") == 1
    assert json.loads(sent) == {"type": "answer", "text": "First line.\n\nSecond line."}


def test_a_step_has_no_link_unless_given():
    step = schemas.StepEvent(id="call_1", words='Searching for "harbor"', state="running")
    assert json.loads(schemas.line(step)) == CASES["events"]["step"]


def test_every_problem_has_its_words():
    kinds = set(get_args(schemas.ProblemKind))
    assert set(schemas.PROBLEMS) == kinds - {"no_key"}
    assert schemas.error(schemas.problem("minute_limit")).model_dump() == CASES["events"]["error"]
    assert schemas.PROBLEMS["too_many_steps"] == (
        "The Copilot stopped after 8 steps without an answer. Try asking something narrower."
    )


def test_a_problem_never_says_who_asked_or_with_what_key():
    for words in [*schemas.PROBLEMS.values(), *schemas.NO_KEY.values()]:
        assert "sk-" not in words
        assert "{" not in words


# GET /copilot


@pytest.fixture
def no_settings(monkeypatch):
    for name in ("OPENROUTER_API_KEY", "OPENROUTER_MODEL", "ACCOUNTABLE_MODEL_URL"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_with_a_key_the_copilot_is_ready(api, no_settings):
    no_settings.setenv("OPENROUTER_API_KEY", MADE_UP_KEY)
    reply = api.get(COPILOT)
    assert reply.status_code == 200
    assert reply.json() == CASES["status"]["with a key"]
    assert MADE_UP_KEY not in reply.text


@pytest.mark.parametrize("key", [None, "", "   "], ids=["unset", "empty", "blank"])
def test_without_a_key_the_local_copy_says_to_add_it_to_env(api, no_settings, key):
    if key is not None:
        no_settings.setenv("OPENROUTER_API_KEY", key)
    reply = api.get(COPILOT)
    assert reply.status_code == 200
    assert reply.json() == CASES["status"]["without a key, in the local copy"]


def test_without_a_key_the_shared_app_says_to_add_it_on_render(shared_api, no_settings):
    reply = shared_api.get(COPILOT)
    assert reply.status_code == 200
    assert reply.json() == CASES["status"]["without a key, in the shared app"]


def test_the_model_named_is_the_one_set(api, no_settings):
    no_settings.setenv("OPENROUTER_API_KEY", MADE_UP_KEY)
    no_settings.setenv("OPENROUTER_MODEL", "  meta-llama/llama-3.3-70b-instruct:free ")
    assert api.get(COPILOT).json() == {"model": "meta-llama/llama-3.3-70b-instruct:free", "problem": None}


def test_it_needs_signing_in(local_app, no_settings):
    no_settings.setenv("OPENROUTER_API_KEY", MADE_UP_KEY)
    reply = TestClient(local_app, base_url=LOCAL, client=THIS_COMPUTER).get(COPILOT)
    assert reply.status_code == 401
    assert MADE_UP_KEY not in reply.text


# The model's settings


def test_with_nothing_set_there_is_no_key_and_the_free_router_at_openrouter(no_settings):
    assert model.settings() == model.Settings(key=None, model="openrouter/free", url="https://openrouter.ai/api/v1")


@pytest.mark.parametrize("blank", ["", "  ", "\t\n"])
def test_blank_settings_count_as_unset(no_settings, blank):
    for name in ("OPENROUTER_API_KEY", "OPENROUTER_MODEL", "ACCOUNTABLE_MODEL_URL"):
        no_settings.setenv(name, blank)
    assert model.settings() == model.Settings(key=None, model="openrouter/free", url="https://openrouter.ai/api/v1")


def test_the_settings_are_read_as_set(no_settings):
    no_settings.setenv("OPENROUTER_API_KEY", f" {MADE_UP_KEY} ")
    no_settings.setenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    chosen = model.settings()
    assert (chosen.key, chosen.model) == (MADE_UP_KEY, "openai/gpt-4o-mini")


def test_the_tests_address_replaces_openrouters(no_settings):
    """So no test's backend can reach OpenRouter, whatever key it's given."""
    no_settings.setenv("ACCOUNTABLE_MODEL_URL", "http://127.0.0.1:9/")
    assert model.settings().url == "http://127.0.0.1:9"


def test_the_settings_never_show_the_key(no_settings):
    no_settings.setenv("OPENROUTER_API_KEY", MADE_UP_KEY)
    assert MADE_UP_KEY not in repr(model.settings())
    assert MADE_UP_KEY not in str(model.settings())
