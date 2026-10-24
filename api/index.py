"""Vercel entrypoint: exposes the FastAPI app as a Python serverless function.

vercel.json rewrites /api/* here; the app sees the original path, so its /api
routes match exactly as they do locally and in Docker.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
