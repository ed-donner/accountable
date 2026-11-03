"""Which addresses can reach the app, and what it accepts, in the local copy and in the shared app (Security)."""

import pytest
from accountable import settings
from accountable.main import make_app
from conftest import PROJECT
from fastapi.testclient import TestClient

RENDER_HOST = "accountable-team.onrender.com"


@pytest.fixture
def client_in_each_copy(copy) -> TestClient:
    """Signed in, in each copy in turn."""
    return copy.client()


@pytest.mark.parametrize("base_url", ["http://localhost", "http://127.0.0.1", "http://localhost:8000"])
def test_local_hosts_are_accepted(copy, base_url):
    assert copy.client(base_url=base_url).get("/api/meta").status_code == 200


@pytest.mark.parametrize("base_url", ["http://evil.example", f"https://{RENDER_HOST}", "http://192.168.1.20"])
def test_any_other_host_is_refused(copy, base_url):
    assert copy.client(base_url=base_url).get("/api/meta").status_code == 400


@pytest.fixture(params=["local copy", "shared app"])
def shared(request) -> settings.Shared | None:
    return None if request.param == "local copy" else PROJECT


@pytest.fixture
def on_render(shared, supabase, built_frontend, database, monkeypatch):
    """Builds the app as it starts on Render, which names the service's address in RENDER_EXTERNAL_HOSTNAME."""

    def start(hostname: str | None) -> TestClient:
        if hostname is None:
            monkeypatch.delenv("RENDER_EXTERNAL_HOSTNAME", raising=False)
        else:
            monkeypatch.setenv("RENDER_EXTERNAL_HOSTNAME", hostname)
        app = make_app(shared, keys=supabase.key_set(), frontend=built_frontend)
        return TestClient(app, base_url=f"https://{RENDER_HOST}")

    return start


def test_renders_address_is_accepted_when_render_names_it(on_render):
    # Past the host check, so refused only for want of a token.
    assert on_render(RENDER_HOST).get("/api/meta").status_code == 401


@pytest.mark.parametrize("hostname", [None, "", "  ", "another-team.onrender.com"])
def test_renders_address_is_refused_unless_render_names_it(on_render, hostname):
    assert on_render(hostname).get("/api/meta").status_code == 400


def test_a_non_json_body_is_refused(client_in_each_copy):
    reply = client_in_each_copy.post("/api/organizations", content="name=Acme", headers={"content-type": "text/plain"})
    assert reply.status_code == 415


def test_a_form_post_is_refused(client_in_each_copy):
    assert client_in_each_copy.post("/api/organizations", data={"name": "Acme"}).status_code == 415


def test_no_cross_origin_headers_are_sent(client_in_each_copy):
    reply = client_in_each_copy.get("/api/meta", headers={"origin": "http://evil.example"})
    assert not [name for name in reply.headers if name.lower().startswith("access-control-")]


def test_a_token_in_a_cookie_counts_for_nothing(copy):
    token = copy.sign()
    client = copy.client(headers={})
    client.cookies.set("Authorization", f"Bearer {token}")
    client.cookies.set("token", token)
    assert client.get("/api/meta").status_code == 401


def test_a_javascript_website_is_refused(client_in_each_copy):
    reply = client_in_each_copy.post("/api/organizations", json={"name": "Acme", "website": "javascript:alert(1)"})
    assert reply.status_code == 422
    assert reply.json()["fields"]["website"]


@pytest.mark.parametrize(
    "website",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "  javascript:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "mailto:sam@example.com",
    ],
)
def test_a_website_that_could_run_something_is_refused_when_adding_and_editing(client_in_each_copy, make, website):
    client = client_in_each_copy
    assert client.post("/api/organizations", json={"name": "Acme", "website": website}).status_code == 422
    reply = client.patch(f"/api/organizations/{make.organization()}", json={"website": website})
    assert reply.status_code == 422


@pytest.mark.parametrize(
    "website", ["java\tscript:alert(1)", "java\nscript:alert(1)", "//evil.example", "\x01javascript:alert(1)"]
)
def test_a_website_with_hidden_characters_can_only_end_up_as_a_web_address(client_in_each_copy, website):
    reply = client_in_each_copy.post("/api/organizations", json={"name": "Acme", "website": website})
    assert reply.status_code == 422 or reply.json()["website"].startswith(("http://", "https://"))
