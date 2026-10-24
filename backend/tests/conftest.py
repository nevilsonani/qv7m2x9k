from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.frames import normalise_actuals, normalise_forecasts
from app.data.store import load_dataset
from app.main import create_app
from app.services.analytics import WindAnalytics


def forecasts(*rows: tuple[str, str, float]) -> pd.DataFrame:
    """Build a forecasts frame from (publish_time, target_time, mw) tuples."""
    return normalise_forecasts(pd.DataFrame(rows, columns=["publish_time", "target_time", "forecast_mw"]))


def actuals(*rows: tuple[str, float, str]) -> pd.DataFrame:
    """Build an actuals frame from (target_time, mw, publish_time) tuples."""
    return normalise_actuals(pd.DataFrame(rows, columns=["target_time", "actual_mw", "publish_time"]))


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value).tz_convert("UTC") if pd.Timestamp(value).tzinfo else pd.Timestamp(value, tz="UTC")


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(data_mode="snapshot", static_dir=None)


@pytest.fixture(scope="session")
def analytics(settings: Settings) -> WindAnalytics:
    return WindAnalytics(load_dataset(settings), settings)


@pytest.fixture(scope="session")
def client(settings: Settings, analytics: WindAnalytics) -> TestClient:
    return TestClient(create_app(settings, analytics))
