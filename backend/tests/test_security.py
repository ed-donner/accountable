import pytest
from accountable.main import app
from fastapi.testclient import TestClient

LOCAL = "http://localhost"


def client(base_url: str = LOCAL) -> TestClient:
    return TestClient(app, base_url=base_url)


def test_local_hosts_are_accepted():
    assert client("http://localhost").get("/api/meta").status_code == 200
    assert client("http://127.0.0.1").get("/api/meta").status_code == 200


def test_a_wrong_host_is_refused():
    assert client("http://evil.example").get("/api/meta").status_code == 400


def test_a_non_json_body_is_refused():
    reply = client().post("/api/organizations", content="name=Acme", headers={"content-type": "text/plain"})
    assert reply.status_code == 415


def test_a_form_post_is_refused():
    reply = client().post("/api/organizations", data={"name": "Acme"})
    assert reply.status_code == 415


def test_no_cross_origin_headers_are_sent():
    reply = client().get("/api/meta", headers={"origin": "http://evil.example"})
    assert not [name for name in reply.headers if name.lower().startswith("access-control-")]


def test_a_javascript_website_is_refused(api):
    reply = api.post("/api/organizations", json={"name": "Acme", "website": "javascript:alert(1)"})
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
def test_a_website_that_could_run_something_is_refused_when_adding_and_editing(api, make, website):
    assert api.post("/api/organizations", json={"name": "Acme", "website": website}).status_code == 422
    reply = api.patch(f"/api/organizations/{make.organization()}", json={"website": website})
    assert reply.status_code == 422


@pytest.mark.parametrize(
    "website", ["java\tscript:alert(1)", "java\nscript:alert(1)", "//evil.example", "\x01javascript:alert(1)"]
)
def test_a_website_with_hidden_characters_can_only_end_up_as_a_web_address(api, website):
    reply = api.post("/api/organizations", json={"name": "Acme", "website": website})
    assert reply.status_code == 422 or reply.json()["website"].startswith(("http://", "https://"))
