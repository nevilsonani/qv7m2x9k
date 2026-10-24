"""Canonical in-memory shapes of the two datasets.

forecasts: one row per (forecast run, target hour)
    publish_time  datetime64[ns, UTC]  when the run was published
    target_time   datetime64[ns, UTC]  start of the hour being forecast
    forecast_mw   float                forecast national wind generation

actuals: one row per settlement period
    target_time   datetime64[ns, UTC]  start of the half-hour
    actual_mw     float                metered national wind generation
    publish_time  datetime64[ns, UTC]  when the outturn became available
"""

from __future__ import annotations

import pandas as pd

FORECAST_COLUMNS = ["publish_time", "target_time", "forecast_mw"]
ACTUAL_COLUMNS = ["target_time", "actual_mw", "publish_time"]


def to_utc(values: pd.Series | pd.Index) -> pd.Series:
    """Parse to tz-aware UTC at nanosecond resolution so joins never mix units."""
    return pd.to_datetime(values, utc=True).astype("datetime64[ns, UTC]")


def normalise_forecasts(df: pd.DataFrame) -> pd.DataFrame:
    out = df[FORECAST_COLUMNS].copy()
    out["publish_time"] = to_utc(out["publish_time"])
    out["target_time"] = to_utc(out["target_time"])
    out["forecast_mw"] = out["forecast_mw"].astype(float)
    # A forecast is only a forecast if it looks forward. WINDFOR runs also carry a
    # few hours of already-elapsed targets; they are dropped here, once.
    out = out[out["target_time"] >= out["publish_time"]]
    return out.sort_values(["publish_time", "target_time"]).reset_index(drop=True)


def normalise_actuals(df: pd.DataFrame) -> pd.DataFrame:
    out = df[ACTUAL_COLUMNS].copy()
    out["target_time"] = to_utc(out["target_time"])
    out["publish_time"] = to_utc(out["publish_time"])
    out["actual_mw"] = out["actual_mw"].astype(float)
    return out.sort_values("target_time").reset_index(drop=True)
