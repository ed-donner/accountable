import pytest
from fastapi.testclient import TestClient


def test_meta_gives_the_clocks_today(client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    assert response.json() == {"today": "2026-11-19"}


@pytest.mark.parametrize("host", ["127.0.0.1:8000", "localhost:8000", "127.0.0.1"])
def test_requests_to_this_computer_are_answered(client, host):
    assert client.get("/api/meta", headers={"host": host}).status_code == 200


@pytest.mark.parametrize("host", ["rebind.example:8000", "rebind.example", "testserver"])
def test_requests_to_any_other_host_are_refused(client, host):
    # A DNS-rebinding page sends its own domain name as the host.
    response = client.get("/api/meta", headers={"host": host})
    assert response.status_code == 400


def test_a_plain_test_client_is_refused(client):
    with TestClient(client.app) as plain:
        assert plain.get("/api/meta").status_code == 400
