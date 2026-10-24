"""Which forecast was available when a decision had to be made.

Every analysis in the product reduces to one question per target time ``t``: *what
was the most recent forecast for t that had been published by cutoff(t)?*

- Day-ahead decision basis: cutoff(t) = gate closure of the auction that buys t.
- Fixed lead-time basis:    cutoff(t) = t - h.

Both use the same as-of selection, so they can never disagree on how a forecast is
picked. Only forward-looking rows exist (see ``frames.normalise_forecasts``).
"""

from __future__ import annotations

import pandas as pd

from app.domain.market import GateClosure, decision_cutoffs

HOUR = pd.Timedelta(hours=1)


def select_as_of(forecasts: pd.DataFrame, cutoffs: pd.Series) -> pd.DataFrame:
    """Latest run published at or before ``cutoffs[t]`` that covers ``t``.

    ``cutoffs`` is indexed by target time. Returns a frame indexed by target time
    with ``publish_time``, ``forecast_mw`` and ``lead_h``. Targets with no eligible
    run are absent.
    """
    eligible = forecasts.join(cutoffs.rename("cutoff"), on="target_time", how="inner")
    eligible = eligible[eligible["publish_time"] <= eligible["cutoff"]]
    latest = (
        eligible.sort_values(["target_time", "publish_time"])
        .drop_duplicates("target_time", keep="last")
        .set_index("target_time")
    )
    latest["lead_h"] = (latest.index - latest["publish_time"]) / HOUR
    return latest[["publish_time", "forecast_mw", "lead_h"]]


def target_times(forecasts: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DatetimeIndex:
    """Forecast target times in ``[start, end)``."""
    times = pd.DatetimeIndex(forecasts["target_time"].unique()).sort_values()
    return times[(times >= start) & (times < end)]


def decision_forecast(
    forecasts: pd.DataFrame, gate: GateClosure, start: pd.Timestamp, end: pd.Timestamp
) -> pd.DataFrame:
    """The forecast in hand at gate closure, for every target time in ``[start, end)``."""
    times = target_times(forecasts, start, end).to_series()
    cutoffs = decision_cutoffs(times, gate)
    cutoffs.index = times.index
    return select_as_of(forecasts, cutoffs)


def horizon_forecast(forecasts: pd.DataFrame, horizon_h: float, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """The forecast published at least ``horizon_h`` hours before each target time."""
    times = target_times(forecasts, start, end)
    cutoffs = pd.Series(times - horizon_h * HOUR, index=times)
    return select_as_of(forecasts, cutoffs)
