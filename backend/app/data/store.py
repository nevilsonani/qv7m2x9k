"""Loading the dataset from the committed snapshot or live from Elexon.

The snapshot holds the raw Elexon rows (no filtering), so it can be audited against
the API. Cleaning happens once, in ``build_dataset``, whichever way data arrives.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pandas as pd

from app.config import Settings
from app.data.elexon import ElexonClient
from app.data.frames import normalise_actuals, normalise_forecasts
from app.domain.market import delivery_window_utc

log = logging.getLogger(__name__)

FORECASTS_FILE = "windfor.csv.gz"
ACTUALS_FILE = "fuelhh_wind.csv.gz"
MANIFEST_FILE = "manifest.json"


@dataclass(frozen=True)
class Dataset:
    forecasts: pd.DataFrame
    actuals: pd.DataFrame
    source: str
    fetched_at: datetime


@dataclass(frozen=True)
class RawData:
    forecasts: pd.DataFrame
    actuals: pd.DataFrame
    fetched_at: datetime


@dataclass(frozen=True)
class FetchWindow:
    publish_from: datetime
    publish_to: datetime
    settlement_from: date
    settlement_to: date

    @classmethod
    def for_settings(cls, settings: Settings) -> FetchWindow:
        last_delivery = settings.decision_end + timedelta(days=1)
        history_start = datetime.combine(
            settings.decision_start - timedelta(days=settings.warmup_days), datetime.min.time(), tzinfo=UTC
        )
        return cls(
            publish_from=history_start,
            publish_to=delivery_window_utc(last_delivery)[1],
            settlement_from=history_start.date(),
            settlement_to=last_delivery,
        )


def build_dataset(raw: RawData, source: str) -> Dataset:
    return Dataset(
        forecasts=normalise_forecasts(raw.forecasts),
        actuals=normalise_actuals(raw.actuals),
        source=source,
        fetched_at=raw.fetched_at,
    )


def fetch_raw(settings: Settings) -> RawData:
    window = FetchWindow.for_settings(settings)
    with ElexonClient(settings.elexon_base_url, timeout_s=settings.elexon_timeout_s) as client:
        forecasts = client.wind_forecasts(window.publish_from, window.publish_to)
        actuals = client.wind_actuals(window.settlement_from, window.settlement_to)
    return RawData(forecasts=forecasts, actuals=actuals, fetched_at=datetime.now(UTC))


def save_snapshot(raw: RawData, directory: Path, settings: Settings) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    _write_csv(raw.forecasts, directory / FORECASTS_FILE)
    _write_csv(raw.actuals, directory / ACTUALS_FILE)
    window = FetchWindow.for_settings(settings)
    manifest = {
        "fetched_at": raw.fetched_at.isoformat(timespec="seconds"),
        "source": settings.elexon_base_url,
        "decision_start": settings.decision_start.isoformat(),
        "decision_end": settings.decision_end.isoformat(),
        "datasets": {
            "WINDFOR": {
                "endpoint": "/datasets/WINDFOR/stream",
                "publish_from": window.publish_from.isoformat(),
                "publish_to": window.publish_to.isoformat(),
                "rows": len(raw.forecasts),
                "runs": int(raw.forecasts["publish_time"].nunique()),
            },
            "FUELHH": {
                "endpoint": "/datasets/FUELHH/stream?fuelType=WIND",
                "settlement_from": window.settlement_from.isoformat(),
                "settlement_to": window.settlement_to.isoformat(),
                "rows": len(raw.actuals),
            },
        },
    }
    (directory / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n")


def load_raw(directory: Path) -> RawData:
    manifest = json.loads((directory / MANIFEST_FILE).read_text())
    return RawData(
        forecasts=pd.read_csv(directory / FORECASTS_FILE),
        actuals=pd.read_csv(directory / ACTUALS_FILE),
        fetched_at=datetime.fromisoformat(manifest["fetched_at"]),
    )


def load_dataset(settings: Settings) -> Dataset:
    if settings.data_mode == "snapshot":
        log.info("Loading snapshot from %s", settings.snapshot_dir)
        return build_dataset(load_raw(settings.snapshot_dir), source="snapshot")

    cache = settings.cache_dir
    if (cache / MANIFEST_FILE).exists():
        log.info("Loading cached live data from %s", cache)
        return build_dataset(load_raw(cache), source="elexon-live")

    log.info("Fetching live data from Elexon")
    raw = fetch_raw(settings)
    try:
        save_snapshot(raw, cache, settings)
    except OSError:
        log.warning("Could not cache live data in %s", cache, exc_info=True)
    return build_dataset(raw, source="elexon-live")


def _write_csv(df: pd.DataFrame, path: Path) -> None:
    out = df.copy()
    for column in out.columns:
        if isinstance(out[column].dtype, pd.DatetimeTZDtype):
            out[column] = out[column].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    out.to_csv(path, index=False, compression={"method": "gzip", "mtime": 0})
