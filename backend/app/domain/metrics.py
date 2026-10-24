"""Forecast error statistics.

Sign convention used everywhere: ``error = forecast - actual`` (MW).
A positive error is an over-forecast: less wind turned up than planned for, so the
shortfall had to be bought later, usually at a worse price.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.domain.market import UK_TZ, delivery_dates

LEVEL_BUCKETS_MW = [0, 5_000, 10_000, 15_000, np.inf]


@dataclass(frozen=True)
class ErrorStats:
    n: int
    mae: float
    rmse: float
    bias: float
    mean_actual: float
    mean_forecast: float
    nmae_pct: float
    bias_pct: float
    p10: float
    p50: float
    p90: float
    p90_abs: float
    max_abs: float
    over_forecast_share: float
    corr: float | None


def pair(forecast: pd.Series, actuals: pd.Series) -> pd.DataFrame:
    """Join forecasts to actuals on exact target time and add the error column."""
    out = pd.DataFrame({"forecast": forecast, "actual": actuals.reindex(forecast.index)}).dropna()
    out["error"] = out["forecast"] - out["actual"]
    return out


def error_stats(pairs: pd.DataFrame) -> ErrorStats | None:
    if pairs.empty:
        return None
    err = pairs["error"].to_numpy()
    actual = pairs["actual"].to_numpy()
    forecast = pairs["forecast"].to_numpy()
    mean_actual = float(actual.mean())
    mae = float(np.abs(err).mean())
    bias = float(err.mean())
    p10, p50, p90 = np.quantile(err, [0.1, 0.5, 0.9])
    corr = float(np.corrcoef(forecast, actual)[0, 1]) if len(err) > 2 and actual.std() > 0 else None
    return ErrorStats(
        n=len(err),
        mae=mae,
        rmse=float(np.sqrt((err**2).mean())),
        bias=bias,
        mean_actual=mean_actual,
        mean_forecast=float(forecast.mean()),
        nmae_pct=100 * mae / mean_actual if mean_actual else float("nan"),
        bias_pct=100 * bias / mean_actual if mean_actual else float("nan"),
        p10=float(p10),
        p50=float(p50),
        p90=float(p90),
        p90_abs=float(np.quantile(np.abs(err), 0.9)),
        max_abs=float(np.abs(err).max()),
        over_forecast_share=float((err > 0).mean()),
        corr=corr,
    )


def histogram(errors: pd.Series, bin_mw: int = 500) -> list[dict[str, float]]:
    if errors.empty:
        return []
    lo = np.floor(errors.min() / bin_mw) * bin_mw
    hi = np.ceil(errors.max() / bin_mw) * bin_mw + bin_mw
    counts, edges = np.histogram(errors, bins=np.arange(lo, hi + 1, bin_mw))
    return [
        {"x0": float(a), "x1": float(b), "count": int(c)} for a, b, c in zip(edges[:-1], edges[1:], counts, strict=True)
    ]


def by_local_hour(pairs: pd.DataFrame) -> pd.DataFrame:
    """Error profile by hour of day (UK local time)."""
    hours = pairs.index.tz_convert(UK_TZ).hour
    grouped = pairs["error"].groupby(hours)
    return pd.DataFrame(
        {
            "n": grouped.size(),
            "bias": grouped.mean(),
            "mae": grouped.apply(lambda e: e.abs().mean()),
            "p10": grouped.quantile(0.1),
            "p90": grouped.quantile(0.9),
        }
    ).rename_axis("hour")


def by_forecast_level(pairs: pd.DataFrame) -> pd.DataFrame:
    """Error and outturn ratio by forecast level, to show error scaling with wind."""
    buckets = pd.cut(pairs["forecast"], LEVEL_BUCKETS_MW, right=False)
    grouped = pairs.groupby(buckets, observed=True)
    out = pd.DataFrame(
        {
            "n": grouped.size(),
            "bias": grouped["error"].mean(),
            "mae": grouped["error"].apply(lambda e: e.abs().mean()),
            "ratio": grouped["actual"].sum() / grouped["forecast"].sum(),
        }
    )
    out["lo"] = [interval.left for interval in out.index]
    out["hi"] = pd.Series(
        [None if np.isinf(interval.right) else interval.right for interval in out.index], index=out.index, dtype=object
    )
    return out.reset_index(drop=True)


def energy_by_delivery_day(series_mw: pd.Series, resolution_h: float) -> pd.DataFrame:
    """Energy (MWh) per delivery day from a MW series at a fixed resolution.

    Each value is treated as the average power over its period.
    """
    if series_mw.empty:
        return pd.DataFrame(columns=["mwh", "periods"])
    days = delivery_dates(series_mw.index.to_series())
    grouped = series_mw.groupby(days.to_numpy())
    return pd.DataFrame({"mwh": grouped.sum() * resolution_h, "periods": grouped.size()})
