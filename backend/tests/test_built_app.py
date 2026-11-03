"""The shared app serves the built frontend and the API from one address (W1, W7), and
nothing else from the repo (Security). The local copy leaves the frontend to Vite."""

from pathlib import Path

import pytest
from accountable.main import make_app
from conftest import LOCAL, PROJECT
from fastapi.testclient import TestClient

PAGE = "<!doctype html><title>Accountable</title>"
SECRET = "the database password"

# Each reaches the server with a real ".." in its path, as the test client sends it.
ESCAPES = [
    "/%2e%2e/secret.txt",
    "/..%2fsecret.txt",
    "/%2e%2e%2f%2e%2e%2fsecret.txt",
    "/assets/..%2f..%2f..%2fsecret.txt",
    "/assets/%2e%2e/%2e%2e/%2e%2e/secret.txt",
    "/..%5c..%5csecret.txt",
    "/%252e%252e/%252e%252e/secret.txt",
    "/%2e%2e/%2e%2e/frontend/secret.txt",
]


@pytest.fixture
def built(tmp_path) -> Path:
    """A stand-in repo: frontend/dist as the build leaves it, with secrets beside and above it."""
    dist = tmp_path / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(PAGE)
    (dist / "assets" / "index-3f9a.js").write_text("console.log('Accountable');")
    (dist / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    (tmp_path / "secret.txt").write_text(SECRET)
    (tmp_path / "frontend" / "secret.txt").write_text(SECRET)
    return dist


@pytest.fixture
def site(built, database, supabase) -> TestClient:
    return TestClient(make_app(PROJECT, keys=supabase.key_set(), frontend=built), base_url=LOCAL)


@pytest.mark.parametrize(
    "path, text, kind",
    [
        ("/assets/index-3f9a.js", "console.log('Accountable');", "javascript"),
        ("/favicon.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"),
        ("/index.html", PAGE, "text/html"),
    ],
)
def test_a_built_file_is_served(site, path, text, kind):
    reply = site.get(path)
    assert (reply.status_code, reply.text) == (200, text)
    assert kind in reply.headers["content-type"]


@pytest.mark.parametrize(
    "path", ["/", "/deals/12", "/organizations?q=harbor", "/pipeline", "/no/such/page", "/assets/gone.js", "/apiary"]
)
def test_any_other_address_outside_api_gets_the_page(site, path):
    reply = site.get(path)
    assert (reply.status_code, reply.text) == (200, PAGE)
    assert reply.headers["content-type"].startswith("text/html")


def test_the_page_is_checked_with_the_server_each_time_so_a_deploy_shows_at_once(site):
    for path in ("/", "/index.html", "/deals/12"):
        assert site.get(path).headers["cache-control"] == "no-cache"
    assert "cache-control" not in site.get("/assets/index-3f9a.js").headers


UNKNOWN_API_ADDRESSES = ["/api", "/api/", "/api/nothing-here", "/api/deals/12/nothing", "/api/index.html"]


@pytest.mark.parametrize("path", UNKNOWN_API_ADDRESSES)
def test_an_unknown_api_address_gets_a_json_404(site, supabase, path):
    reply = site.get(path, headers={"Authorization": f"Bearer {supabase.token()}"})
    assert (reply.status_code, reply.json()) == (404, {"detail": "Not Found"})


@pytest.mark.parametrize("path", UNKNOWN_API_ADDRESSES)
def test_signed_out_an_unknown_api_address_is_refused_like_any_other(site, path):
    reply = site.get(path)
    assert (reply.status_code, reply.json()) == (401, {"detail": "Sign in to use Accountable."})


@pytest.mark.parametrize("path", ESCAPES)
def test_nothing_outside_the_built_folder_can_be_reached(site, path):
    reply = site.get(path)
    assert SECRET not in reply.text
    assert reply.status_code == 404 or reply.text == PAGE


def test_the_api_is_still_the_api(site, supabase):
    reply = site.get("/api/meta", headers={"Authorization": f"Bearer {supabase.token()}"})
    assert reply.status_code == 200
    assert reply.json()["stages"]


@pytest.mark.parametrize("path", ["/", "/deals/12", "/index.html", "/assets/index-3f9a.js"])
def test_the_local_copy_serves_no_frontend(local_app, path):
    assert TestClient(local_app, base_url=LOCAL).get(path).status_code == 404
