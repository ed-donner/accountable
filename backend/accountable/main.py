"""The app: its routes, the checks every request goes through, and what runs as it starts.

`make_app` builds it for whichever copy the settings name (C8), so tests can build
the shared app's routes on their own SQLite database, with a stand-in for Supabase's keys.
"""

import os
from collections.abc import AsyncGenerator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path, PurePath

import jwt
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.types import Scope

from accountable import auth, cli, db, settings
from accountable.crm import sample_data, schemas
from accountable.crm.routers import activities, contacts, dashboard, deals, meta, organizations, search

FRONTEND = db.ROOT / "frontend" / "dist"


def make_app(
    shared: settings.Shared | None, *, keys: jwt.PyJWKClient | None = None, frontend: Path = FRONTEND
) -> FastAPI:
    """The local copy with no settings, or the shared app, serving the built frontend as well as the API."""
    app = FastAPI(title="Accountable", docs_url=None, redoc_url=None, openapi_url=None, lifespan=_lifespan(shared))
    app.state.sign_in = auth.LocalSignIn() if shared is None else auth.SupabaseSignIn(shared, keys)

    # Each middleware added goes outside the ones before it, so a request meets these
    # in the opposite order: the host, then the token, then the body's type. No
    # cross-origin middleware is added, and tokens travel in a header, never a cookie,
    # so another website in the same browser can't make a signed-in request.
    app.middleware("http")(_json_only)
    app.add_middleware(auth.RequireSignIn, open_paths=_local_sign_in_paths() if shared is None else ())
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts())
    app.exception_handler(RequestValidationError)(_invalid_request)
    app.exception_handler(schemas.FieldError)(_invalid_field)
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
    api = APIRouter(prefix="/api", dependencies=[Depends(auth.current_user)])
    api.include_router(auth.router)
    for module in (meta, organizations, contacts, deals, activities, dashboard, search):
        api.include_router(module.router)
    return api


def _lifespan(shared: settings.Shared | None) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
        # Migrations, then on Postgres the row-level security check. Either failing stops the start.
        db.prepare_database(cli.fill_sample)
        if shared is None:
            # A database from before sign-in has nobody to sign in as.
            with db.writing() as conn:
                sample_data.add_missing_teammates(conn)
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


async def _json_only(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return JSONResponse({"detail": "Send JSON."}, status_code=415)
    return await call_next(request)


async def _invalid_request(request: Request, error: RequestValidationError):
    fields = schemas.field_messages(error.errors())
    return JSONResponse({"detail": "Check the form.", "fields": fields}, status_code=422)


async def _invalid_field(request: Request, error: schemas.FieldError):
    return JSONResponse({"detail": "Check the form.", "fields": error.fields}, status_code=422)


async def _unexpected_error(request: Request, error: Exception):
    # Always JSON, so the frontend can tell this from the proxy's empty reply
    # when the backend isn't there at all.
    return JSONResponse({"detail": "Something went wrong."}, status_code=500)


app = make_app(settings.load())
