"""Runtime configuration, read from environment variables prefixed with ``WINDDESK_``."""

from __future__ import annotations

import tempfile
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WINDDESK_", env_file=".env", extra="ignore")

    # Elexon Insights Solution (BMRS) public API. No API key is required.
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_s: float = 60.0

    # Scope of the pilot: day-ahead purchase decisions made in January 2026.
    decision_start: date = date(2026, 1, 1)
    decision_end: date = date(2026, 1, 31)
    # History loaded before the first decision so the trailing calibration window
    # is full on day one. It is never shown in any analysis.
    warmup_days: int = 7

    # "snapshot" reads the committed data files (fast, deterministic, offline).
    # "live" fetches from Elexon on start-up and caches the result in cache_dir.
    data_mode: Literal["snapshot", "live"] = "snapshot"
    snapshot_dir: Path = BACKEND_DIR / "data" / "snapshot"
    cache_dir: Path = Path(tempfile.gettempdir()) / "winddesk"

    # Built frontend to serve from the API process (single-container deploys).
    static_dir: Path | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Calibration (see app/domain/calibration.py).
    calibration_window_days: int = 7


@lru_cache
def get_settings() -> Settings:
    return Settings()
