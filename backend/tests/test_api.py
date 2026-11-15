"""The shared API pieces, and that every route says what it returns."""

from fastapi.testclient import TestClient

from backend.app import api, db
from backend.app.main import app


def test_plural():
    assert api.plural(1, "deal", "deals") == "1 deal"
    assert api.plural(0, "deal", "deals") == "0 deals"
    assert api.plural(3, "activity", "activities") == "3 activities"


def test_every_route_documents_its_response():
    """Each route returns a named model (or nothing), so the OpenAPI schema is the contract the frontend relies on.

    A route that returns a bare `dict` gets a schema of "any object", which this catches.
    """
    missing = []
    for path, operations in app.openapi()["paths"].items():
        for method, op in operations.items():
            if "204" in op["responses"]:
                continue
            code = next(c for c in op["responses"] if c.startswith("2"))
            schema = op["responses"][code].get("content", {}).get("application/json", {}).get("schema", {})
            if "$ref" not in schema and "$ref" not in schema.get("items", {}):
                missing.append(f"{method.upper()} {path}")
    assert missing == []


def test_validation_errors_give_one_message_per_field(isolated_db):  # R58
    db.create_schema()
    with TestClient(app) as c:
        response = c.post("/api/deals", json={"name": " ", "value_cents": -1, "close_date": "soon"})
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Check the highlighted fields",
        "fields": {
            "name": "This is required",
            "organization_id": "This is required",
            "value_cents": "Must be 0 or more",
            "close_date": "Enter a valid date",
        },
    }
