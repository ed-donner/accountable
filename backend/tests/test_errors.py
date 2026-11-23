"""TB36: friendly errors."""

from app.main import app


def test_field_messages_are_plain(client):
    body = client.post("/api/contacts", json={"name": "", "email": "x@"}).json()
    assert body["message"] == "Check the highlighted fields and try again."
    assert body["fields"] == {
        "name": "Enter a name.",
        "email": "Enter an email address like name@company.com.",
    }


def test_missing_record_is_a_friendly_404(client):
    for path, kind in (
        ("organizations", "organization"),
        ("contacts", "contact"),
        ("deals", "deal"),
    ):
        response = client.get(f"/api/{path}/9999")
        assert response.status_code == 404
        assert (
            response.json()["message"] == f"We couldn't find that {kind}. It may have been deleted."
        )
    assert (
        client.get("/api/nowhere").json()["message"] == "We couldn't find that page in Accountable."
    )


def test_unexpected_error_gives_general_message(client):
    @app.get("/api/boom")
    def boom():
        raise RuntimeError("secret detail at line 12")

    try:
        response = client.get("/api/boom")
    finally:
        app.router.routes.pop()
    assert response.status_code == 500
    text = response.text
    assert "secret" not in text and "Traceback" not in text
    assert response.json()["message"].startswith("Something went wrong in Accountable.")


def test_requests_for_another_host_are_refused(client):
    """RV10: DNS rebinding. Only requests addressed to this computer are answered."""
    refused = client.get("/api/health", headers={"Host": "evil.example.com"})
    assert refused.status_code == 400
    # The refusal uses the API's usual error shape.
    assert refused.json() == {
        "message": "Accountable only answers requests made on this computer.",
        "fields": {},
    }
    assert client.get("/api/health", headers={"Host": "127.0.0.1:8000"}).status_code == 200
    assert client.get("/api/health", headers={"Host": "localhost:8000"}).status_code == 200


def test_text_and_page_size_are_capped(client):
    """RV10: names, notes and list pages have sensible limits, with plain messages."""
    response = client.post("/api/organizations", json={"name": "N" * 201})
    assert response.status_code == 400
    assert response.json()["fields"] == {"name": "Keep this to 200 characters or fewer."}
    response = client.post("/api/organizations", json={"name": "Acme", "notes": "x" * 10_001})
    assert response.json()["fields"] == {"notes": "Keep this to 10,000 characters or fewer."}
    assert (
        client.post(
            "/api/organizations", json={"name": "N" * 200, "notes": "x" * 10_000}
        ).status_code
        == 201
    )
    assert client.get("/api/organizations?limit=1001").status_code == 400
