import numpy as np
import pandas as pd
import pytest

from app.domain import calibration as cal
from tests.conftest import actuals, forecasts, ts


def _history(days: int = 10, ratio: float = 0.8) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Runs published at 09:30 each day forecasting 10 GW for every hour 14-37h ahead,
    with outturn at ``ratio`` of the forecast published 30 minutes after each period."""
    runs, outturn = [], []
    for day in pd.date_range("2026-01-01T09:30Z", periods=days, freq="1D"):
        for lead in range(14, 38):
            runs.append((day.isoformat(), (day + pd.Timedelta(hours=lead, minutes=30)).isoformat(), 10_000.0))
    targets = sorted({t for _, t, _ in runs})
    for t in targets:
        stamp = pd.Timestamp(t)
        outturn.append((t, 10_000.0 * ratio, (stamp + pd.Timedelta(minutes=30)).isoformat()))
    return forecasts(*runs), actuals(*outturn)


def test_factor_is_ratio_of_sums_over_known_outturn():
    f, a = _history(ratio=0.8)
    training = cal.training_pairs(f, a)
    fitted = cal.fit(training, ts("2026-01-09T09:50Z"), window_days=7)
    assert fitted.applied
    assert fitted.factor == pytest.approx(0.8)
    assert fitted.ratio_low == pytest.approx(0.8)


def test_no_look_ahead_future_outturn_does_not_change_calibration():
    f, a = _history()
    as_of = ts("2026-01-08T09:50Z")
    baseline = cal.fit(cal.training_pairs(f, a), as_of, window_days=7)

    tampered = a.copy()
    future = tampered["publish_time"] > as_of
    tampered.loc[future, "actual_mw"] = np.random.default_rng(0).uniform(0, 50_000, future.sum())
    after = cal.fit(cal.training_pairs(f, tampered), as_of, window_days=7)

    assert after == baseline


def test_outturn_is_used_only_once_published():
    f, a = _history()
    late = a.assign(publish_time=a["publish_time"] + pd.Timedelta(days=30))
    fitted = cal.fit(cal.training_pairs(f, late), ts("2026-01-08T09:50Z"), window_days=7)
    assert not fitted.applied
    assert fitted.factor == 1.0


def test_apply_scales_forecast_and_band():
    fitted = cal.Calibration(ts("2026-01-08T09:50Z"), ts("2026-01-01T09:50Z"), 100, 0.9, 0.7, 1.1, applied=True)
    out = cal.apply(pd.Series([1_000.0]), fitted)
    assert out.iloc[0].tolist() == pytest.approx([900, 700, 1_100])


def test_unapplied_calibration_passes_forecast_through():
    fitted = cal.Calibration(ts("2026-01-08T09:50Z"), ts("2026-01-01T09:50Z"), 0, 1.0, np.nan, np.nan, applied=False)
    out = cal.apply(pd.Series([1_000.0]), fitted)
    assert out["calibrated_mw"].item() == 1_000
    assert out["low_mw"].isna().all()
