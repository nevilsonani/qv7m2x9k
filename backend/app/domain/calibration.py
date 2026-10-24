"""Causal calibration of the day-ahead wind forecast.

January 2026 showed a large, persistent over-forecast that scales with wind level
(see docs/ANALYSIS.md). That pattern suits a multiplicative correction:

    calibrated(t) = k * forecast(t)
    k             = sum(actual) / sum(forecast) over the trailing window
    80% range     = forecast(t) * [P10, P90] of actual/forecast over the same window

The window is the ``window_days`` of target times before gate closure, using only
pairs whose outturn had been *published* by gate closure, and only forecasts made
with day-ahead-like lead times. Nothing after the decision is used, so a backtest of
the calibrated forecast is an honest estimate of what the desk would have seen.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

LEAD_RANGE_H = (12.0, 40.0)
BAND_QUANTILES = (0.1, 0.9)
MIN_PAIRS = 48
MIN_FORECAST_MW = 100.0  # ratios are meaningless when almost no wind is forecast


@dataclass(frozen=True)
class Calibration:
    as_of: pd.Timestamp
    window_start: pd.Timestamp
    n: int
    factor: float
    ratio_low: float
    ratio_high: float
    applied: bool


def training_pairs(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Every (run, target) pair with a day-ahead-like lead time and a known outturn."""
    lead_h = (forecasts["target_time"] - forecasts["publish_time"]) / pd.Timedelta(hours=1)
    candidates = forecasts[(lead_h >= LEAD_RANGE_H[0]) & (lead_h <= LEAD_RANGE_H[1])]
    candidates = candidates[candidates["forecast_mw"] >= MIN_FORECAST_MW]
    merged = candidates.merge(
        actuals.rename(columns={"publish_time": "actual_published"}), on="target_time", how="inner"
    )
    merged["ratio"] = merged["actual_mw"] / merged["forecast_mw"]
    return merged.sort_values("target_time").reset_index(drop=True)


def fit(training: pd.DataFrame, as_of: pd.Timestamp, window_days: int) -> Calibration:
    window_start = as_of - pd.Timedelta(days=window_days)
    known = training[(training["actual_published"] <= as_of) & (training["target_time"] >= window_start)]
    if len(known) < MIN_PAIRS:
        return Calibration(as_of, window_start, len(known), 1.0, float("nan"), float("nan"), applied=False)
    low, high = np.quantile(known["ratio"], BAND_QUANTILES)
    return Calibration(
        as_of=as_of,
        window_start=window_start,
        n=len(known),
        factor=float(known["actual_mw"].sum() / known["forecast_mw"].sum()),
        ratio_low=float(low),
        ratio_high=float(high),
        applied=True,
    )


def apply(forecast_mw: pd.Series, calibration: Calibration) -> pd.DataFrame:
    """Calibrated forecast and 80% range for one decision."""
    if not calibration.applied:
        nan = pd.Series(np.nan, index=forecast_mw.index)
        return pd.DataFrame({"calibrated_mw": forecast_mw, "low_mw": nan, "high_mw": nan})
    return pd.DataFrame(
        {
            "calibrated_mw": forecast_mw * calibration.factor,
            "low_mw": forecast_mw * calibration.ratio_low,
            "high_mw": forecast_mw * calibration.ratio_high,
        }
    )
