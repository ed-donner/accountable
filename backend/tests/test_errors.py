"""TB36: friendly errors."""

from app.main import app


def test_field_messages_are_plain(client):
    body = client.post("/api/contacts", json={"name": "", "email": "x@"}).json()
    assert body["message"] == "Check the highlighted fields and try again."
    assert body["fields"] == {"name": "Enter a name.", "email": "Enter an email address like name@company.com."}


def test_missing_record_is_a_friendly_404(client):
    for path, kind in (("organizations", "organization"), ("contacts", "contact"), ("deals", "deal")):
        response = client.get(f"/api/{path}/9999")
        assert response.status_code == 404
        assert response.json()["message"] == f"We couldn't find that {kind}. It may have been deleted."
    assert client.get("/api/nowhere").json()["message"] == "We couldn't find that page in Accountable."


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
