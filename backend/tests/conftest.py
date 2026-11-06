"""Shared pytest setup.

The guard below runs before anything else, so a wrong path stops the run before
a test can touch real data.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import shutil
import time
from collections.abc import Callable, Generator, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jwt.algorithms import ECAlgorithm, RSAAlgorithm
from sqlalchemy import Connection, Table, insert, make_url, select

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REAL_DATA_FOLDER = PROJECT_ROOT / "data"

TODAY = date(2026, 10, 31)
NOW = datetime(2026, 10, 31, 15, 0, 0)


# The shared app's settings. Any one of them would point the tests, the ones that wipe
# tables included, at the team's data, or stop the backend for want of the others (C9).
SHARED_APP_SETTINGS = ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")
# The Copilot's key, with which a test could call a real model on the team's account (Z19).
MODEL_KEY = "OPENROUTER_API_KEY"


def _check_database_path() -> None:
    shared = [name for name in SHARED_APP_SETTINGS if os.environ.get(name, "").strip()]
    if shared:
        pytest.exit(
            f"Refusing to run with {', '.join(shared)} set: the tests must never reach the shared app's data. "
            "Run them with npm test, which leaves the shared app's settings out.",
            returncode=2,
        )
    if os.environ.get(MODEL_KEY, "").strip():
        pytest.exit(
            f"Refusing to run with {MODEL_KEY} set: the tests must never call a real model. "
            "Run them with npm test, which leaves the Copilot's settings out.",
            returncode=2,
        )
    path = os.environ.get("ACCOUNTABLE_DB")
    if not path:
        pytest.exit("ACCOUNTABLE_DB isn't set. Run the tests with npm test.", returncode=2)
    if Path(path).resolve().is_relative_to(REAL_DATA_FOLDER.resolve()):
        pytest.exit(f"Refusing to run against {path}: that's where real data lives.", returncode=2)


_check_database_path()

from accountable import auth, db, settings, users
from accountable.bills.tables import bill_number_key, bills
from accountable.crm import rules
from accountable.crm.tables import activities, contacts, deals, organizations
from accountable.invoices.tables import invoices, payments
from accountable.products.tables import name_key, products

LOCAL = "http://localhost"
# Where a request from this computer comes from. The local copy's sign-in accepts no
# other, and TestClient's own, "testclient", isn't an address.
THIS_COMPUTER = ("127.0.0.1", 50000)

# The shared app's settings, for tests that build it. Its database is never used:
# make_app takes the database from the environment, which the tests point at SQLite.
PROJECT = settings.Shared(
    database_url=make_url("postgresql+psycopg://stand-in@localhost/stand-in"),
    supabase_url="https://stand-in-project.supabase.co",
    supabase_publishable_key="stand-in-publishable-key",
)
# Someone added in the stand-in Supabase project, who isn't a made-up teammate.
SUPABASE_PERSON = {"id": "9a7f6c1e-3b2d-4c5e-8f90-1a2b3c4d5e6f", "name": "Pat Quinn", "email": "pat.quinn@team.example"}


@contextmanager
def using_database(path: Path) -> Generator[None]:
    """Points the app at this file, for fixtures that outlive a single test."""
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("ACCOUNTABLE_DB", str(path))
        db.dispose()
        yield
        db.dispose()


@pytest.fixture(scope="session")
def migrated_file(tmp_path_factory) -> Path:
    """One database built from the migrations, which takes about 50ms. Tests copy it."""
    path = tmp_path_factory.mktemp("migrated") / "migrated.db"
    with using_database(path):
        db.prepare_database(lambda _conn: None)
    return path


@pytest.fixture
def database(migrated_file, tmp_path, monkeypatch) -> Iterator[Path]:
    """A fresh, empty database in a folder of its own."""
    path = tmp_path / "test.db"
    shutil.copyfile(migrated_file, path)
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    yield path
    db.dispose()


def insert_row(conn: Connection, table: Table, **values: Any) -> int:
    """Inserts one row and returns its new id."""
    return conn.execute(insert(table).values(**values).returning(table.c.id)).scalar_one()


class Make:
    """Puts records straight in the database, so a test can focus on one thing."""

    def organization(self, name: str = "Harbor & Pine", **values: Any) -> int:
        with db.writing() as conn:
            return insert_row(conn, organizations, name=name, **values)

    def contact(self, name: str = "Sam Carter", **values: Any) -> int:
        with db.writing() as conn:
            return insert_row(conn, contacts, name=name, **values)

    def deal(self, name: str = "Annual support", *, user_id: str | None = None, **values: Any) -> int:
        """Added through the rules, by nobody, like a deal from before sign-in, unless someone is named."""
        row = {"stage": "new", "value": 10000, "close_date": date(2026, 12, 1), **values}
        with db.writing() as conn:
            return rules.add_deal(conn, {"name": name, **row}, today=TODAY, now=NOW, user_id=user_id)

    def activity(self, **values: Any) -> int:
        row = {"type": "note", "description": "Spoke to them", "occurred_at": NOW, **values}
        with db.writing() as conn:
            return insert_row(conn, activities, **row)

    def product(self, name: str = "Pro license", **values: Any) -> int:
        """Active, by nobody, like a record from before sign-in, unless told otherwise."""
        row = {"unit_price_cents": 4950, **values}
        with db.writing() as conn:
            return insert_row(conn, products, name=name, name_key=name_key(name), **row)

    def invoice(self, deal_id: int, **values: Any) -> int:
        """A draft on the deal, or an issued one if the values say so, put straight in the database."""
        row = {"status": "draft", **values}
        with db.writing() as conn:
            return insert_row(conn, invoices, deal_id=deal_id, **row)

    def payment(self, invoice_id: int, amount_cents: int, paid_on: date = TODAY, **values: Any) -> int:
        row = {"method": "card", **values}
        with db.writing() as conn:
            return insert_row(conn, payments, invoice_id=invoice_id, amount_cents=amount_cents, paid_on=paid_on, **row)

    def bill(self, organization_id: int | None = None, bill_number: str = "INV-0042", **values: Any) -> int:
        """Unpaid, dated today and due in 30 days, by nobody, like a record from before sign-in,
        from a supplier of its own unless one is given."""
        supplier = self.organization("Northwind Software") if organization_id is None else organization_id
        row = {
            "bill_date": TODAY,
            "due_date": TODAY + timedelta(days=30),
            "amount_cents": 124000,
            "tax_cents": 0,
            "category": "software",
            **values,
        }
        with db.writing() as conn:
            return insert_row(
                conn,
                bills,
                organization_id=supplier,
                bill_number=bill_number,
                bill_number_key=bill_number_key(bill_number),
                **row,
            )


@pytest.fixture
def make(database) -> Make:
    return Make()


@pytest.fixture
def deal_row(database):
    def read(deal_id: int):
        with db.reading() as conn:
            return conn.execute(select(deals).where(deals.c.id == deal_id)).one()

    return read


@pytest.fixture
def contact_row(database):
    def read(contact_id: int):
        with db.reading() as conn:
            return conn.execute(select(contacts).where(contacts.c.id == contact_id)).one()

    return read


Headers = dict[str, str]


def bearer(token: str) -> Headers:
    return {"Authorization": f"Bearer {token}"}


def local_token(app: FastAPI, user_id: str) -> str:
    """A token from the local copy's sign-in route, as the sign-in screen gets one."""
    reply = TestClient(app, base_url=LOCAL, client=THIS_COMPUTER).post("/api/local/sign-in", json={"user_id": user_id})
    assert reply.status_code == 200, reply.text
    return reply.json()["token"]


def fixed_time(app: FastAPI) -> None:
    app.dependency_overrides[db.local_today] = lambda: TODAY
    app.dependency_overrides[db.utc_now] = lambda: NOW


@pytest.fixture
def local_app(database) -> Iterator[FastAPI]:
    """The local copy on a fresh database with its made-up teammates, as it starts, and today and now fixed."""
    from accountable.main import app

    with db.writing() as conn:
        users.add_missing_teammates(conn)
    fixed_time(app)
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def api(local_app) -> TestClient:
    """The local copy's API on a fresh database, signed in as Alex Rivera, the first made-up teammate."""
    token = local_token(local_app, users.TEAMMATES[0].id)
    return TestClient(local_app, base_url=LOCAL, headers=bearer(token), client=THIS_COMPUTER)


@pytest.fixture
def sign_in_as(api) -> Callable[[str], TestClient]:
    """Signs the api client in as another made-up teammate, by id, and returns it."""

    def switch(user_id: str) -> TestClient:
        api.headers.update(bearer(local_token(api.app, user_id)))
        return api

    return switch


# The shared app, with Supabase stood in for


class StandInKeys(auth.SupabaseKeys):
    """The Supabase project's key set, served from memory rather than fetched, counting each fetch."""

    def __init__(self, keys: list[dict[str, Any]]) -> None:
        super().__init__(PROJECT)
        self.served = keys
        self.fetches = 0
        self.reachable = True

    def fetch_data(self) -> Any:
        self.fetches += 1
        if not self.reachable:
            raise jwt.PyJWKClientConnectionError("Supabase can't be reached")
        return {"keys": self.served}


class StandInSupabase:
    """Stands in for a Supabase project: its signing keys, and the tokens its Auth gives."""

    def __init__(self) -> None:
        self.private_keys = {
            "current": ec.generate_private_key(ec.SECP256R1()),
            "rsa": rsa.generate_private_key(public_exponent=65537, key_size=2048),
            # Published once Supabase rotates its keys.
            "next": ec.generate_private_key(ec.SECP256R1()),
        }
        # Not the project's, so nothing it signs should be accepted.
        self.impostor = ec.generate_private_key(ec.SECP256R1())

    def public_key(self, kid: str) -> dict[str, Any]:
        """One key as the project's key set publishes it."""
        key = self.private_keys[kid]
        if isinstance(key, rsa.RSAPrivateKey):
            return {**RSAAlgorithm.to_jwk(key.public_key(), as_dict=True), "kid": kid, "alg": "RS256"}
        return {**ECAlgorithm.to_jwk(key.public_key(), as_dict=True), "kid": kid, "alg": "ES256"}

    def key_set(self, *kids: str) -> StandInKeys:
        return StandInKeys([self.public_key(kid) for kid in kids or ("current", "rsa")])

    def claims(self, **changes: Any) -> dict[str, Any]:
        """A signed-in person's claims, as Supabase Auth gives them."""
        now = int(time.time())
        claims = {
            "iss": f"{PROJECT.supabase_url}/auth/v1",
            "aud": "authenticated",
            "role": "authenticated",
            "sub": SUPABASE_PERSON["id"],
            "email": SUPABASE_PERSON["email"],
            "user_metadata": {"display_name": SUPABASE_PERSON["name"]},
            "is_anonymous": False,
            "iat": now,
            "exp": now + 3600,
        }
        return with_changes(claims, changes)

    def token(self, kid: str = "current", *, elsewhere: bool = False, **changes: Any) -> str:
        """A token with these changes to its claims, signed with that key, or with one that isn't the project's."""
        key = self.impostor if elsewhere else self.private_keys[kid]
        algorithm = "RS256" if isinstance(key, rsa.RSAPrivateKey) else "ES256"
        return jwt.encode(self.claims(**changes), key, algorithm=algorithm, headers={"kid": kid})

    def signed_with_the_public_key(self) -> str:
        """The classic forgery: HS256, with the public key, which anyone can fetch, as the secret."""
        public = self.private_keys["current"].public_key()
        secret = public.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        return hand_made_token({"alg": "HS256", "typ": "JWT", "kid": "current"}, self.claims(), secret)


def with_changes(claims: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """The claims with these changes. A change to None leaves that claim out."""
    return {name: value for name, value in {**claims, **changes}.items() if value is not None}


def hand_made_token(header: dict[str, Any], claims: dict[str, Any], secret: bytes | None) -> str:
    """A token put together by hand, as an attacker would, signed with HMAC SHA-256, or not signed at all."""

    def part(value: dict[str, Any] | bytes) -> str:
        raw = value if isinstance(value, bytes) else json.dumps(value).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    signing_input = f"{part(header)}.{part(claims)}"
    signature = hmac.new(secret, signing_input.encode(), hashlib.sha256).digest() if secret else b""
    return f"{signing_input}.{part(signature)}"


@pytest.fixture(scope="session")
def supabase() -> StandInSupabase:
    """Made once a run, because making the keys takes a moment."""
    return StandInSupabase()


@pytest.fixture(scope="session")
def built_frontend(tmp_path_factory) -> Path:
    """A stand-in for frontend/dist, which the tests never build."""
    folder = tmp_path_factory.mktemp("dist")
    (folder / "index.html").write_text("<!doctype html><title>Accountable</title>")
    (folder / "assets").mkdir()
    (folder / "assets" / "app.js").write_text("console.log('Accountable');")
    return folder


@pytest.fixture(scope="session")
def shared_app(supabase, built_frontend) -> FastAPI:
    """The shared app's routes, with Supabase's keys stood in for and today and now fixed.
    Built once a run: its database is whichever one the test points at."""
    from accountable.main import make_app

    app = make_app(PROJECT, keys=supabase.key_set(), frontend=built_frontend)
    fixed_time(app)
    return app


@pytest.fixture
def shared_api(database, shared_app, supabase) -> TestClient:
    """The shared app's API on a fresh database, signed in as someone added in the stand-in Supabase project."""
    return TestClient(shared_app, base_url=LOCAL, headers=bearer(supabase.token()))


# Both copies, for checks every route has to pass in each


@dataclass
class Copy:
    """One of the two ways to run, with what it should and shouldn't let in."""

    name: str
    app: FastAPI
    sign: Callable[..., str]
    """A good token with these changes to its claims, or signed elsewhere=True with a key that isn't this copy's."""
    refused_only_here: dict[str, Headers]

    def client(self, headers: Headers | None = None, base_url: str = LOCAL) -> TestClient:
        """Signed in unless other headers are given. Crashes answer as the real server does, with a 500."""
        signed_in = bearer(self.sign()) if headers is None else headers
        return TestClient(
            self.app, base_url=base_url, headers=signed_in, raise_server_exceptions=False, client=THIS_COMPUTER
        )

    def refused(self) -> dict[str, Headers]:
        """Every way of failing to sign in that this copy has to refuse, by name."""
        now = int(time.time())
        return {
            "no token": {},
            "an empty token": {"Authorization": "Bearer "},
            "another scheme": {"Authorization": f"Basic {self.sign()}"},
            "not a token": bearer("not-a-token"),
            "an expired token": bearer(self.sign(iat=now - 7200, exp=now - 3600)),
            "a token with no expiry": bearer(self.sign(exp=None)),
            "a token with nobody in it": bearer(self.sign(sub=None)),
            "a token with a blank person": bearer(self.sign(sub="")),
            "a token signed with another key": bearer(self.sign(elsewhere=True)),
            "a token for the anon audience": bearer(self.sign(aud="anon")),
            "a token for the anon role": bearer(self.sign(role="anon")),
            "a token for the service role": bearer(self.sign(role="service_role")),
            "an anonymous user's token": bearer(self.sign(is_anonymous=True)),
            **self.refused_only_here,
        }


def local_copy(app: FastAPI, supabase: StandInSupabase) -> Copy:
    """Its tokens are made the way the sign-in route makes them, then changed."""
    claims = jwt.decode(local_token(app, users.TEAMMATES[0].id), options={"verify_signature": False})

    def sign(*, elsewhere: bool = False, **changes: Any) -> str:
        key = secrets.token_bytes(64) if elsewhere else auth.local_key()
        return jwt.encode(with_changes(claims, changes), key, algorithm="HS256")

    return Copy(
        name="local copy",
        app=app,
        sign=sign,
        refused_only_here={
            "the shared app's token": bearer(supabase.token()),
            "a token for someone who isn't a teammate": bearer(sign(sub="teammate-nobody")),
        },
    )


def shared_copy(app: FastAPI, supabase: StandInSupabase) -> Copy:
    local_style = with_changes(supabase.claims(), {"iss": auth.LOCAL_ISSUER})
    return Copy(
        name="shared app",
        app=app,
        sign=supabase.token,
        refused_only_here={
            "another project's token": bearer(supabase.token(iss="https://another-project.supabase.co/auth/v1")),
            "an HS256 token signed with the public key": bearer(supabase.signed_with_the_public_key()),
            "an unsigned token": bearer(hand_made_token({"alg": "none", "kid": "current"}, supabase.claims(), None)),
            "a token naming a key that isn't there": bearer(supabase.token("retired", elsewhere=True)),
            "a token with no email": bearer(supabase.token(email=None)),
            "the local copy's token": bearer(jwt.encode(local_style, secrets.token_bytes(64), algorithm="HS256")),
        },
    )


@pytest.fixture(params=["local copy", "shared app"])
def copy(request, database, supabase) -> Iterator[Copy]:
    """Each test that takes this runs twice: once in the local copy and once in the shared app."""
    if request.param == "local copy":
        yield local_copy(request.getfixturevalue("local_app"), supabase)
    else:
        yield shared_copy(request.getfixturevalue("shared_app"), supabase)


# Invoices, for the tests of invoices, payments, the Money section and the PDF


@dataclass
class Billing:
    """A won deal for Harbor & Pine, with Sam Carter as its main contact, three products, and
    the company's name saved, so a draft can be started and issued through the API."""

    api: TestClient
    organization: int
    contact: int
    deal: int
    products: dict[str, int]

    @contextmanager
    def on(self, day: date) -> Generator[None]:
        """Today is this day for the requests inside, such as an issue."""
        self.api.app.dependency_overrides[db.local_today] = lambda: day
        try:
            yield
        finally:
            self.api.app.dependency_overrides[db.local_today] = lambda: TODAY

    def draft(self, deal: int | None = None) -> dict[str, Any]:
        reply = self.api.post("/api/invoices", json={"deal_id": deal or self.deal})
        assert reply.status_code == 201, reply.text
        return reply.json()

    def line(self, product: str, **values: Any) -> dict[str, Any]:
        return {"product_id": self.products[product], **values}

    def issued(self, *lines: dict[str, Any], on: date = TODAY, deal: int | None = None) -> dict[str, Any]:
        """A draft issued on this day with these lines, or one Pro license if none are given."""
        invoice = self.draft(deal)
        with self.on(on):
            reply = self.api.post(
                f"/api/invoices/{invoice['id']}/issue", json={"lines": list(lines) or [self.line("Pro license")]}
            )
        assert reply.status_code == 200, reply.text
        return reply.json()

    def pay(self, invoice: dict[str, Any], cents: int, on: date = TODAY, **values: Any) -> dict[str, Any]:
        body = {"paid_on": on.isoformat(), "amount_cents": cents, "method": "bank_transfer", **values}
        with self.on(on):
            reply = self.api.post(f"/api/invoices/{invoice['id']}/payments", json=body)
        assert reply.status_code == 201, reply.text
        return reply.json()


@pytest.fixture
def billing(api, make) -> Billing:
    organization = make.organization("Harbor & Pine")
    contact = make.contact("Sam Carter", email="sam@harbor.example", organization_id=organization)
    deal = make.deal(
        "Annual support", stage="won", close_date=TODAY, organization_id=organization, main_contact_id=contact
    )
    products = {
        "Pro license": make.product("Pro license", unit_price_cents=4950, description="One named user"),
        "Annual support plan": make.product("Annual support plan", unit_price_cents=360000),
        "Training day": make.product("Training day", unit_price_cents=125000, description="Up to 12 people"),
    }
    saved = api.patch(
        "/api/settings",
        json={
            "company_name": "Plainsong Systems",
            "address": "48 Orchard Row\nBrooklyn, NY 11201",
            "email": "accounts@plainsong.example",
            "phone": "(718) 555-0142",
            "tax_label": "Sales tax",
            "tax_rate": "8.875",
        },
    )
    assert saved.status_code == 200, saved.text
    return Billing(api=api, organization=organization, contact=contact, deal=deal, products=products)


@pytest.fixture
def open_deal(billing, make) -> int:
    """A deal in Proposal for Harbor & Pine, with Sam Carter as its main contact, which can take quotes."""
    return make.deal("Renewal", stage="proposal", organization_id=billing.organization, main_contact_id=billing.contact)
