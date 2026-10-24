"""FastAPI application factory.

The same app runs everywhere: ``uvicorn app.main:app`` locally and in Docker, and
as a Vercel Python function via ``api/index.py``. When ``WINDDESK_STATIC_DIR``
points at a built frontend, it is served from the same process (single container).
"""

from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import Settings, get_settings
from app.data.store import load_dataset
from app.services.analytics import InvalidRequestError, NotInWindowError, WindAnalytics

log = logging.getLogger(__name__)

# The data is a fixed historical window, so responses can be cached hard by the CDN.
API_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400"


class AnalyticsProvider:
    """Builds the analytics on first use. Lazy so serverless cold starts stay cheap
    for requests (like /api/health) that never touch the data."""

    def __init__(self, settings: Settings, analytics: WindAnalytics | None = None) -> None:
        self._settings = settings
        self._analytics = analytics
        self._lock = threading.Lock()

    def get(self) -> WindAnalytics:
        if self._analytics is None:
            with self._lock:
                if self._analytics is None:
                    self._analytics = WindAnalytics(load_dataset(self._settings), self._settings)
        return self._analytics


def create_app(settings: Settings | None = None, analytics: WindAnalytics | None = None) -> FastAPI:
    settings = settings or get_settings()
    provider = AnalyticsProvider(settings, analytics)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        provider.get()  # load data before the first request where lifespan is supported
        yield

    app = FastAPI(
        title="WindDesk API",
        version="1.0.0",
        summary="GB day-ahead wind forecast monitoring (Elexon BMRS WINDFOR vs FUELHH)",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.provider = provider
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"])

    @app.middleware("http")
    async def cache_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/") and path != "/api/health" and response.status_code == 200:
            response.headers.setdefault("Cache-Control", API_CACHE_CONTROL)
        return response

    @app.exception_handler(NotInWindowError)
    async def not_in_window(_: Request, exc: NotInWindowError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidRequestError)
    async def invalid(_: Request, exc: InvalidRequestError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    app.include_router(router)

    if settings.static_dir and (settings.static_dir / "index.html").exists():
        _mount_frontend(app, settings.static_dir)
    return app


def _mount_frontend(app: FastAPI, static_dir: Path) -> None:
    root = static_dir.resolve()
    index = root / "index.html"
    if (root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        return FileResponse(index)

    log.info("Serving frontend from %s", root)


app = create_app()
