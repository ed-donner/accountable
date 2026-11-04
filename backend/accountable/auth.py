"""Who's signed in (U7). Every API request carries a token in its Authorization
header, and the person comes from the token and nothing else.

The local copy signs its own tokens for the made-up teammates (U13), and accepts
them only from this computer. The shared app accepts only Supabase's, checked
against the project's public signing keys.
"""

import ipaddress
import math
import secrets
import threading
from collections.abc import Collection
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Protocol
from weakref import WeakKeyDictionary

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.security.utils import get_authorization_scheme_param
from pydantic import BaseModel, Field
from sqlalchemy import Engine, select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from accountable import db, settings
from accountable.users import Profile, profile, remember, users

SIGNED_OUT = "Sign in to use Accountable."
KEYS_UNREACHABLE = "Can't check your sign-in right now."

# Supabase's audience and role for a signed-in person. The local copy's tokens use them too.
SIGNED_IN = "authenticated"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1"})
LOCAL_ISSUER = "accountable-local"
# Long enough that a teammate stays signed in until they sign out (U4).
LOCAL_TOKEN_LIFE = timedelta(days=365)
# Only Supabase's asymmetric keys. Accepting HS256 would let the public key be used as a secret.
SUPABASE_ALGORITHMS = ["ES256", "RS256"]
# Room for a clock that's a little out, between Supabase and this server.
CLOCK_LEEWAY = timedelta(seconds=30)

# The keys Supabase's dashboard reads for its Display name column, in its order, so
# the app shows the name the project owner sees there.
NAME_KEYS = ("name", "displayName", "display_name", "fullName", "full_name")

# What fetching the keys can fail with, as opposed to a token naming a key that isn't there.
FETCH_FAILURES = (jwt.PyJWKClientConnectionError, jwt.PyJWKSetError, OSError, ValueError)


class SignedOut(HTTPException):
    def __init__(self) -> None:
        super().__init__(401, SIGNED_OUT, headers={"WWW-Authenticate": "Bearer"})


class SignIn(Protocol):
    def user_id(self, token: str, from_this_computer: bool) -> str:
        """The signed-in person's id, with their users row up to date, or SignedOut."""
        ...


def _from_this_computer(request: Request) -> bool:
    """Whether the request is for this computer's own address and comes from this computer.
    The address is only the Host header, which the client can set to anything, so the
    connection has to come from this computer too. Uvicorn replaces that with
    X-Forwarded-For only on a connection from this computer, so no header can fake it."""
    if request.url.hostname not in LOCAL_HOSTS or request.client is None:
        return False
    try:
        return ipaddress.ip_address(request.client.host).is_loopback
    except ValueError:
        return False


def _claims(token: str, key: Any, *, algorithms: list[str], issuer: str) -> dict[str, Any]:
    """The token's claims, if it's signed by that key, current, and for a signed-in person who isn't anonymous."""
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=SIGNED_IN,
            issuer=issuer,
            leeway=CLOCK_LEEWAY,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as error:
        raise SignedOut() from error
    if not claims["sub"] or claims.get("role") != SIGNED_IN or claims.get("is_anonymous", False) is not False:
        raise SignedOut()
    return claims


NameAndEmail = tuple[str | None, str]

# The users rows the sign-in check has already read or written, for each database, so a
# request from someone already seen needs no trip to the database, which in the shared
# app is an ocean away. Rows are never deleted (U9), and the shared app runs as one
# process (W6), so what's kept here stays true. A new engine, such as a test's own
# database, starts with nobody seen.
_seen: WeakKeyDictionary[Engine, dict[str, NameAndEmail]] = WeakKeyDictionary()
_seen_lock = threading.Lock()


def _seen_as(user_id: str) -> NameAndEmail | None:
    engine = db.engine()
    with _seen_lock:
        return _seen.get(engine, {}).get(user_id)


def _note(user_id: str, seen: NameAndEmail) -> None:
    engine = db.engine()
    with _seen_lock:
        _seen.setdefault(engine, {})[user_id] = seen


def _is_known(user_id: str) -> bool:
    if _seen_as(user_id) is not None:
        return True
    with db.reading() as conn:
        row = conn.execute(select(users.c.name, users.c.email).where(users.c.id == user_id)).one_or_none()
    if row is None:
        return False
    _note(user_id, (row.name, row.email))
    return True


def _local_token(user_id: str) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": user_id,
        "aud": SIGNED_IN,
        "role": SIGNED_IN,
        "iss": LOCAL_ISSUER,
        "iat": now,
        "exp": now + LOCAL_TOKEN_LIFE,
    }
    return jwt.encode(claims, local_key(), algorithm="HS256")


class LocalSignIn:
    """The local copy: its own tokens, for the people in its users table, the made-up teammates."""

    def user_id(self, token: str, from_this_computer: bool) -> str:
        # The local copy should never be reachable from elsewhere. If it somehow is,
        # such as on Render without its settings, nobody can sign in to it.
        if not from_this_computer:
            raise SignedOut()
        user_id = _claims(token, local_key(), algorithms=["HS256"], issuer=LOCAL_ISSUER)["sub"]
        if not _is_known(user_id):
            raise SignedOut()
        return user_id


# A new database's first requests can arrive together, and only one of them may make its key.
_making_key = threading.Lock()


def local_key() -> bytes:
    """The local copy's signing key, kept in a file beside its database, so each database
    has its own and a restart signs nobody out (U15). Made the first time it's needed."""
    path = db.database_path().with_suffix(".key")
    if not path.exists():
        with _making_key:
            if not path.exists():
                _make_key(path)
    return path.read_bytes()


def _make_key(path: Path) -> None:
    """Written in full under another name first, so the key is never seen half made."""
    path.parent.mkdir(parents=True, exist_ok=True)
    made = path.with_name(f"{path.name}.new")
    made.touch(mode=0o600)
    made.write_bytes(secrets.token_bytes(64))
    made.replace(path)


class SupabaseKeys(jwt.PyJWKClient):
    """The Supabase project's public signing keys.

    They're kept until a token names a key that isn't among them, which is how a new
    key shows up after Supabase rotates them, and only then fetched again. PyJWKClient
    would otherwise fetch them every 5 minutes, and requests would wait on Supabase.
    """

    def __init__(self, shared: settings.Shared) -> None:
        super().__init__(
            f"{shared.supabase_url}/auth/v1/.well-known/jwks.json",
            lifespan=math.inf,
            # At most one fetch in this many seconds for keys it hasn't seen, so made-up
            # tokens can't keep the app waiting on Supabase.
            cooldown_duration=30,
            timeout=10,
            headers={"apikey": shared.supabase_publishable_key},
        )


class SupabaseSignIn:
    """The shared app: tokens from the Supabase project's own Auth, for signed-in people."""

    def __init__(self, shared: settings.Shared, keys: jwt.PyJWKClient | None = None) -> None:
        self.issuer = f"{shared.supabase_url}/auth/v1"
        self.keys = keys or SupabaseKeys(shared)

    def user_id(self, token: str, from_this_computer: bool) -> str:
        claims = _claims(token, self._signing_key(token), algorithms=SUPABASE_ALGORITHMS, issuer=self.issuer)
        email = claims.get("email")
        if not isinstance(email, str) or not email:
            raise SignedOut()
        _remember(claims["sub"], display_name(claims.get("user_metadata")), email)
        return claims["sub"]

    def _signing_key(self, token: str) -> jwt.PyJWK:
        try:
            return self.keys.get_signing_key_from_jwt(token)
        except FETCH_FAILURES as error:
            # Refuse rather than let the request through unchecked.
            raise HTTPException(503, KEYS_UNREACHABLE) from error
        except jwt.PyJWTError as error:
            raise SignedOut() from error


def display_name(metadata: object) -> str | None:
    """The display name from a Supabase profile's metadata, or None if it has none (U8)."""
    if isinstance(metadata, dict):
        for key in NAME_KEYS:
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _remember(user_id: str, name: str | None, email: str) -> None:
    """Brings the person's users row up to date (U9). The database is touched only for
    someone this process hasn't seen yet, or whose token shows a new name or email."""
    if _seen_as(user_id) == (name, email):
        return
    with db.writing() as conn:
        remember(conn, user_id, name, email)
    _note(user_id, (name, email))


class RequireSignIn(BaseHTTPMiddleware):
    """Checks the token before anything else reads the request, its body included, so a
    request without a good one gets the 401 whatever it sends (U7). Every address under
    /api needs one, apart from the open paths: the local copy's sign-in."""

    def __init__(self, app: ASGIApp, open_paths: Collection[str] = ()) -> None:
        super().__init__(app)
        self.open_paths = frozenset(open_paths)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if (path == "/api" or path.startswith("/api/")) and path not in self.open_paths:
            try:
                # The check reads the database and may fetch Supabase's keys, so it runs off the event loop.
                request.state.user_id = await run_in_threadpool(_signed_in_user, request)
            except HTTPException as refusal:
                return JSONResponse({"detail": refusal.detail}, refusal.status_code, refusal.headers)
        return await call_next(request)


def _signed_in_user(request: Request) -> str:
    scheme, token = get_authorization_scheme_param(request.headers.get("Authorization"))
    if scheme.lower() != "bearer" or not token:
        raise SignedOut()
    sign_in: SignIn = request.app.state.sign_in
    return sign_in.user_id(token, _from_this_computer(request))


def current_user(request: Request) -> str:
    """The signed-in person's id, which RequireSignIn checked before the request got this far."""
    user_id = getattr(request.state, "user_id", None)
    if user_id is None:
        raise SignedOut()
    return user_id


CurrentUser = Annotated[str, Depends(current_user)]

router = APIRouter()


@router.get("/me")
def me(user_id: CurrentUser) -> Profile:
    with db.reading() as conn:
        row = conn.execute(select(users).where(users.c.id == user_id)).one()
    return profile(row.id, row.name, row.email)


def _only_from_this_computer(request: Request) -> None:
    if not _from_this_computer(request):
        raise HTTPException(404)


# The local copy's sign-in (U13), which needs no token. The shared app doesn't have it (U16).
local_router = APIRouter(prefix="/local", dependencies=[Depends(_only_from_this_computer)])


class TeammateChoice(BaseModel):
    # The teammates' ids are plain printable ASCII, so anything else, such as a NUL, is
    # refused like any bad form field rather than looked up.
    user_id: str = Field(min_length=1, max_length=200, pattern=r"^[ -~]+$")


class Token(BaseModel):
    token: str


@local_router.get("/teammates")
def teammates() -> list[Profile]:
    with db.reading() as conn:
        rows = conn.execute(select(users).order_by(users.c.name.nulls_last(), users.c.email)).all()
    return [profile(row.id, row.name, row.email) for row in rows]


@local_router.post("/sign-in")
def sign_in_as(choice: TeammateChoice) -> Token:
    if not _is_known(choice.user_id):
        raise HTTPException(404, "No such teammate.")
    return Token(token=_local_token(choice.user_id))
