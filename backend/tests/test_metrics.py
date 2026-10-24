from datetime import date

import pandas as pd
import pytest

from app.domain.metrics import by_forecast_level, energy_by_delivery_day, error_stats, histogram, pair

IDX = pd.date_range("2026-01-16T00:00Z", periods=4, freq="1h")


def test_error_is_forecast_minus_actual():
    pairs = pair(pd.Series([110.0, 90, 100, 120], index=IDX), pd.Series([100.0, 100, 100, 100], index=IDX))
    stats = error_stats(pairs)
    assert pairs["error"].tolist() == [10, -10, 0, 20]
    assert stats.bias == pytest.approx(5)
    assert stats.mae == pytest.approx(10)
    assert stats.rmse == pytest.approx((600 / 4) ** 0.5)
    assert stats.over_forecast_share == pytest.approx(0.5)
    assert stats.nmae_pct == pytest.approx(10)
    assert stats.max_abs == 20


def test_pairs_drop_targets_without_actuals():
    pairs = pair(pd.Series([1.0, 2.0], index=IDX[:2]), pd.Series([1.0], index=IDX[:1]))
    assert len(pairs) == 1


def test_empty_pairs_give_no_stats():
    assert error_stats(pair(pd.Series(dtype=float), pd.Series(dtype=float))) is None


def test_histogram_bins_cover_all_errors():
    bins = histogram(pd.Series([-600.0, -10, 0, 499, 501]), bin_mw=500)
    assert sum(b["count"] for b in bins) == 5
    assert bins[0]["x0"] == -1000


def test_level_ratio_is_sum_of_actual_over_sum_of_forecast():
    idx = pd.date_range("2026-01-16T00:00Z", periods=3, freq="1h")
    pairs = pair(pd.Series([1_000.0, 16_000, 20_000], index=idx), pd.Series([1_000.0, 12_000, 18_000], index=idx))
    levels = by_forecast_level(pairs)
    top = levels[levels["lo"] == 15_000].iloc[0]
    assert top["ratio"] == pytest.approx(30_000 / 36_000)
    assert top["hi"] is None


def test_energy_groups_by_delivery_day_and_scales_by_resolution():
    idx = pd.date_range("2026-01-15T22:00Z", periods=4, freq="30min")  # 22:00, 22:30 | 23:00, 23:30
    energy = energy_by_delivery_day(pd.Series([100.0, 100, 200, 200], index=idx), 0.5)
    assert energy.loc[date(2026, 1, 15), "mwh"] == 100
    assert energy.loc[date(2026, 1, 16), "mwh"] == 200
