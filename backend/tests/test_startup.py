
from backend.app.main import create_app
from backend.tests.conftest import add_org, local_client, ok


def test_a_new_database_is_created_and_seeded(settings):
    assert not settings.db_path.exists()
    with local_client(create_app(settings)) as client:
        assert len(ok(client.get("/api/organizations"))) == 15
        assert len(ok(client.get("/api/deals"))) == 35
    assert settings.db_path.exists()


def test_a_restart_keeps_changes_and_doesnt_seed_again(settings):
    with local_client(create_app(settings)) as client:
        org = add_org(client, "Kept Co")
        deal_id = ok(client.get("/api/deals"))[0]["id"]
        ok(client.patch(f"/api/deals/{deal_id}", json={"name": "Renamed before restart"}))

    with local_client(create_app(settings)) as client:
        names = [o["name"] for o in ok(client.get("/api/organizations"))]
        assert "Kept Co" in names
        assert len(names) == 16
        assert ok(client.get(f"/api/organizations/{org['id']}"))["name"] == "Kept Co"
        assert ok(client.get(f"/api/deals/{deal_id}"))["name"] == "Renamed before restart"


def test_an_existing_empty_database_isnt_seeded(settings):
    with local_client(create_app(settings, seed_new=False)) as client:
        assert ok(client.get("/api/organizations")) == []
    with local_client(create_app(settings)) as client:
        assert ok(client.get("/api/organizations")) == []
