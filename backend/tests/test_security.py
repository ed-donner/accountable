from fastapi.testclient import TestClient

from accountable.main import app

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
