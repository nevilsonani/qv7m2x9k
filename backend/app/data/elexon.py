"""Client for the two Elexon BMRS datasets the product uses.

- WINDFOR: national wind generation forecast, hourly target times, ~8 runs per day.
- FUELHH:  half-hourly outturn generation by fuel type; we keep ``fuelType == "WIND"``.

Both are read through the ``/stream`` endpoints, which return a flat JSON array and
need no API key. Requests are chunked by week and retried on transient failures.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pandas as pd
from pydantic import BaseModel, TypeAdapter

from app.data.frames import ACTUAL_COLUMNS, FORECAST_COLUMNS, to_utc

log = logging.getLogger(__name__)

CHUNK = timedelta(days=7)
RETRY_STATUSES = {429, 500, 502, 503, 504}


class WindForecastRecord(BaseModel):
    publishTime: datetime
    startTime: datetime
    generation: float


class FuelOutturnRecord(BaseModel):
    publishTime: datetime
    startTime: datetime
    fuelType: str
    generation: float


_forecasts_adapter = TypeAdapter(list[WindForecastRecord])
_outturn_adapter = TypeAdapter(list[FuelOutturnRecord])


class ElexonError(RuntimeError):
    pass


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        timeout_s: float = 60.0,
        retries: int = 3,
        http: httpx.Client | None = None,
    ) -> None:
        self._http = http or httpx.Client(base_url=base_url, timeout=timeout_s)
        self._retries = retries

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        for attempt in range(1, self._retries + 1):
            try:
                response = self._http.get(path, params=params)
            except httpx.TransportError as exc:
                if attempt == self._retries:
                    raise ElexonError(f"GET {path} failed: {exc}") from exc
            else:
                if response.status_code not in RETRY_STATUSES:
                    if response.is_error:
                        raise ElexonError(f"GET {path} returned {response.status_code}: {response.text[:200]}")
                    return response.json()
                if attempt == self._retries:
                    raise ElexonError(f"GET {path} returned {response.status_code} after {attempt} attempts")
            time.sleep(2 ** (attempt - 1))
        raise AssertionError("unreachable")

    def wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> pd.DataFrame:
        """All WINDFOR runs published in ``[publish_from, publish_to)``."""
        records: list[WindForecastRecord] = []
        for start, end in _chunks(publish_from, publish_to):
            raw = self._get(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso(start), "publishDateTimeTo": _iso(end)},
            )
            records += _forecasts_adapter.validate_python(raw)
            log.info("WINDFOR %s -> %s: %d rows", start, end, len(raw))

        df = pd.DataFrame(
            {
                "publish_time": [r.publishTime for r in records],
                "target_time": [r.startTime for r in records],
                "forecast_mw": [r.generation for r in records],
            },
            columns=FORECAST_COLUMNS,
        )
        df["publish_time"] = to_utc(df["publish_time"])
        df["target_time"] = to_utc(df["target_time"])
        df = df[(df["publish_time"] >= publish_from) & (df["publish_time"] < publish_to)]
        return df.drop_duplicates(["publish_time", "target_time"]).sort_values(["publish_time", "target_time"])

    def wind_actuals(self, settlement_from: date, settlement_to: date) -> pd.DataFrame:
        """FUELHH wind outturn for settlement dates ``settlement_from..settlement_to`` inclusive."""
        records: list[FuelOutturnRecord] = []
        day = settlement_from
        while day <= settlement_to:
            last = min(day + CHUNK - timedelta(days=1), settlement_to)
            raw = self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": day.isoformat(),
                    "settlementDateTo": last.isoformat(),
                    "fuelType": "WIND",
                },
            )
            records += _outturn_adapter.validate_python(raw)
            log.info("FUELHH %s -> %s: %d rows", day, last, len(raw))
            day = last + timedelta(days=1)

        df = pd.DataFrame(
            {
                "target_time": [r.startTime for r in records if r.fuelType == "WIND"],
                "actual_mw": [r.generation for r in records if r.fuelType == "WIND"],
                "publish_time": [r.publishTime for r in records if r.fuelType == "WIND"],
            },
            columns=ACTUAL_COLUMNS,
        )
        df["target_time"] = to_utc(df["target_time"])
        df["publish_time"] = to_utc(df["publish_time"])
        # Keep the latest publication if a period was ever re-published.
        return df.sort_values("publish_time").drop_duplicates("target_time", keep="last").sort_values("target_time")


def _chunks(start: datetime, end: datetime) -> Iterator[tuple[datetime, datetime]]:
    while start < end:
        stop = min(start + CHUNK, end)
        yield start, stop
        start = stop


def _iso(ts: datetime) -> str:
    return ts.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
