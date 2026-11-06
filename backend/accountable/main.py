"""The app: its routes, the checks every request goes through, and what runs as it starts.

`make_app` builds it for whichever copy the settings name (C8), so tests can build
the shared app's routes on their own SQLite database, with a stand-in for Supabase's keys.
"""

import os
from collections.abc import AsyncGenerator, Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path, PurePath, PurePosixPath

import jwt
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from accountable import api, auth, cli, db, search, settings, users
from accountable.aging import router as aging_router
from accountable.aging import schemas as aging_schemas
from accountable.bills import cash as bills_cash
from accountable.bills import router as bills
from accountable.bills import schemas as bills_schemas
from accountable.bills import tables as bills_tables
from accountable.books import router as books_router
from accountable.books import schemas as books_schemas
from accountable.cash import Cash
from accountable.cashflow import router as cashflow
from accountable.cashflow import schemas as cashflow_schemas
from accountable.company import router as company_settings
from accountable.company import schemas as company_schemas
from accountable.company.documents import Numbered
from accountable.crm import cash as crm_cash
from accountable.crm import schemas as crm_schemas
from accountable.crm import search as crm_search
from accountable.crm.routers import activities, contacts, dashboard, deals, meta, organizations
from accountable.holds import Hold
from accountable.invoices import cash as invoices_cash
from accountable.invoices import schemas as invoices_schemas
from accountable.invoices import tables as invoices_tables
from accountable.invoices.routers import invoices, money, payments, pdf
from accountable.products import router as products
from accountable.products import schemas as products_schemas
from accountable.products import search as products_search
from accountable.quotes import router as quotes
from accountable.quotes import schemas as quotes_schemas
from accountable.quotes import tables as quotes_tables

FRONTEND = db.ROOT / "frontend" / "dist"


@dataclass(frozen=True)
class Area:
    """A business area, as the app puts it together."""

    routers: Sequence[APIRouter]
    """Its routes, which start with the area's own words, such as /api/products, and no other area's."""
    messages: Mapping[str, str]
    """The messages for its fields, for a request that reached one of its routes."""
    kinds: Sequence[search.Kind] = ()
    """What the top bar's search finds among its records."""
    holds: Sequence[Hold] = ()
    """Which of its records hold a deal or an organization, so that can't be deleted (D4)."""
    cash: Cash | None = None
    """The money it moves or expects, for the cash flow (Y1 to Y22)."""
    numbered: Sequence[Numbered] = ()
    """Where its documents keep the numbers they take, so a new prefix can't match one (B6)."""

    @property
    def route_starts(self) -> set[str]:
        """The words its routes start with, such as {"products"}."""
        return {
            route_start(f"/api{route.path}")
            for router in self.routers
            for route in router.routes
            if isinstance(route, APIRoute)
        }


# Every area, in the order the top bar's search shows its results. A later area joins the end.
AREAS = [
    Area(
        routers=[meta.router, organizations.router, contacts.router, deals.router, activities.router, dashboard.router],
        messages=crm_schemas.FIELD_MESSAGES,
        kinds=crm_search.KINDS,
        cash=crm_cash.CASH,
    ),
    Area(routers=[products.router], messages=products_schemas.FIELD_MESSAGES, kinds=products_search.KINDS),
    Area(routers=[company_settings.router], messages=company_schemas.FIELD_MESSAGES),
    Area(
        routers=[quotes.router],
        messages=quotes_schemas.FIELD_MESSAGES,
        holds=quotes_tables.HOLDS,
        numbered=quotes_tables.NUMBERED,
    ),
    # Money's route comes first, so /invoices/money is never read as an invoice's id.
    Area(
        routers=[money.router, invoices.router, payments.router, pdf.router],
        messages=invoices_schemas.FIELD_MESSAGES,
        holds=invoices_tables.HOLDS,
        cash=invoices_cash.CASH,
        numbered=invoices_tables.NUMBERED,
    ),
    # Bills aren't searched from the top bar (K1), and each one holds its supplier (D4).
    Area(routers=[bills.router], messages=bills_schemas.FIELD_MESSAGES, holds=bills_tables.HOLDS, cash=bills_cash.CASH),
    # The cash flow keeps no records, and reads every area's money from the app.
    Area(routers=[cashflow.router], messages=cashflow_schemas.FIELD_MESSAGES),
    # The books keep their own tables, post nothing from here, and give no holds, cash or search kinds.
    Area(routers=[books_router.router], messages=books_schemas.FIELD_MESSAGES),
    # Aged balances keep no records and read the invoices and bills. They hold nothing, and give no search kinds or cash.
    Area(routers=[aging_router.router], messages=aging_schemas.FIELD_MESSAGES),
]


def route_start(path: str) -> str:
    """The word a route's path starts with after /api, such as "products", or "" for /api itself."""
    parts = PurePosixPath(path).parts
    return parts[2] if parts[1:2] == ("api",) and len(parts) > 2 else ""


_MESSAGES = {start: area.messages for area in AREAS for start in area.route_starts}


def make_app(
    shared: settings.Shared | None, *, keys: jwt.PyJWKClient | None = None, frontend: Path = FRONTEND
) -> FastAPI:
    """The local copy with no settings, or the shared app, serving the built frontend as well as the API."""
    app = FastAPI(title="Accountable", docs_url=None, redoc_url=None, openapi_url=None, lifespan=_lifespan(shared))
    app.state.sign_in = auth.LocalSignIn() if shared is None else auth.SupabaseSignIn(shared, keys)
    app.state.holds = [hold for area in AREAS for hold in area.holds]
    app.state.cash = [area.cash for area in AREAS if area.cash is not None]
    app.state.numbered = [numbered for area in AREAS for numbered in area.numbered]

    # Each middleware added goes outside the ones before it, so a request meets these
    # in the opposite order: the host, then the token, then the body's size, then its
    # type. No cross-origin middleware is added, and tokens travel in a header, never a
    # cookie, so another website in the same browser can't make a signed-in request.
    app.middleware("http")(_json_only)
    app.add_middleware(BodyLimit)
    app.add_middleware(auth.RequireSignIn, open_paths=_local_sign_in_paths() if shared is None else ())
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts())
    app.exception_handler(RequestValidationError)(_invalid_request)
    app.exception_handler(api.FieldError)(_invalid_field)
    app.exception_handler(Exception)(_unexpected_error)

    app.include_router(_signed_in_routes())
    if shared is None:
        app.include_router(auth.local_router, prefix="/api")
    else:
        app.mount("/", BuiltFrontend(directory=frontend))
    return app


def trusted_hosts() -> list[str]:
    """This computer's addresses, and the shared app's onrender.com address when Render runs it."""
    render = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "").strip()
    return sorted(auth.LOCAL_HOSTS) + ([render] if render else [])


def _local_sign_in_paths() -> list[str]:
    return [f"/api{route.path}" for route in auth.local_router.routes if isinstance(route, APIRoute)]


def _signed_in_routes() -> APIRouter:
    routes = APIRouter(prefix="/api", dependencies=[Depends(auth.current_user)])
    routes.include_router(auth.router)
    for area in AREAS:
        for router in area.routers:
            routes.include_router(router)
    routes.include_router(search.router([kind for area in AREAS for kind in area.kinds]))
    return routes


def _lifespan(shared: settings.Shared | None) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
        # Migrations, then on Postgres the row-level security check. Either failing stops the start.
        db.prepare_database(cli.fill_sample)
        if shared is None:
            # A database from before sign-in has nobody to sign in as.
            with db.writing() as conn:
                users.add_missing_teammates(conn)
        yield
        db.dispose()

    return lifespan


class BuiltFrontend(StaticFiles):
    """The shared app's page and files, from frontend/dist. StaticFiles keeps every
    request inside that folder. Any address outside /api that isn't a built file gets
    the page, so a refresh on any of the app's addresses works (W7)."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        if PurePath(path).parts[:1] == ("api",):
            raise HTTPException(404)
        try:
            response = await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404:
                raise
            response = await super().get_response("index.html", scope)
        if response.media_type == "text/html":
            # Checked with the server each time, because a browser keeping an old page
            # would ask for built files that the next deploy has replaced.
            response.headers["cache-control"] = "no-cache"
        return response


MAX_BODY_BYTES = 2 * 1024 * 1024
TOO_BIG = "That's too big to send."


class BodyLimit:
    """Refuses a body over 2 MB with a 413. A logo of 1 MB in base64 is the largest the app
    sends. The bytes are counted as they arrive, so a body sent without a Content-Length, or
    with a false one, is caught too, then handed on to the routes as one piece."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        body = await self._read(receive)
        if body is None:
            await JSONResponse({"detail": TOO_BIG}, status_code=413)(scope, receive, send)
            return
        handed_on = False

        async def replay() -> Message:
            nonlocal handed_on
            if handed_on:
                return await receive()
            handed_on = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)

    @staticmethod
    async def _read(receive: Receive) -> bytes | None:
        """The whole body, or None once it passes the limit."""
        chunks, size, more = [], 0, True
        while more:
            message = await receive()
            if message["type"] != "http.request":
                break
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                return None
            chunks.append(chunk)
            more = message.get("more_body", False)
        return b"".join(chunks)


async def _json_only(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return JSONResponse({"detail": "Send JSON."}, status_code=415)
    return await call_next(request)


def _area_messages(request: Request) -> Mapping[str, str]:
    """The messages for the fields of the area whose route the request reached. The CRM
    and products both have a description, and only the CRM's is required. Routes that
    belong to no area, such as search's, have messages of their own or none."""
    return _MESSAGES.get(route_start(request.url.path), {})


async def _invalid_request(request: Request, error: RequestValidationError):
    fields = api.field_messages(error.errors(), _area_messages(request))
    return JSONResponse({"detail": "Check the form.", "fields": fields}, status_code=422)


async def _invalid_field(request: Request, error: api.FieldError):
    return JSONResponse({"detail": "Check the form.", "fields": error.fields}, status_code=422)


async def _unexpected_error(request: Request, error: Exception):
    # Always JSON, so the frontend can tell this from the proxy's empty reply
    # when the backend isn't there at all.
    return JSONResponse({"detail": "Something went wrong."}, status_code=500)


app = make_app(settings.load())
