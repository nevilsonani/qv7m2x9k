"""Invariants and headline numbers on the committed snapshot.

The headline numbers are what the client was shown. If a change moves them, the
test fails so the change is made deliberately (and the docs updated), not by accident.
"""

import pandas as pd
import pytest

from app.domain.market import GATE_CLOSURES, decision_cutoffs
from app.domain.metrics import error_stats, pair
from app.services.analytics import WindAnalytics


@pytest.mark.parametrize("gate_id", list(GATE_CLOSURES))
def test_decision_forecasts_were_published_before_gate_closure(analytics: WindAnalytics, gate_id: str):
    frame = analytics.decision_frame(gate_id)
    cutoffs = decision_cutoffs(frame.index.to_series(), GATE_CLOSURES[gate_id])
    assert (frame["publish_time"] <= cutoffs).all()
    assert len(frame) == 744  # 31 delivery days x 24 hourly targets


@pytest.mark.parametrize("horizon_h", [0, 1, 12, 24, 48])
def test_horizon_forecasts_respect_lead_time(analytics: WindAnalytics, horizon_h: int):
    frame = analytics.horizon_frame(horizon_h)
    assert (frame["lead_h"] >= horizon_h).all()


def test_snapshot_is_complete_for_the_pilot_window(analytics: WindAnalytics):
    window = analytics.actual_mw[
        (analytics.actual_mw.index >= analytics.start) & (analytics.actual_mw.index < analytics.end)
    ]
    assert len(window) == 31 * 48
    assert window.index.to_series().diff().dropna().eq(pd.Timedelta(minutes=30)).all()


def test_headline_numbers(analytics: WindAnalytics):
    frame = analytics.decision_frame("n2ex")
    raw = error_stats(pair(frame["forecast_mw"], analytics.actual_mw))
    adj = error_stats(pair(frame["calibrated_mw"], analytics.actual_mw))
    assert raw.mae == pytest.approx(1990.9, abs=0.1)
    assert raw.bias == pytest.approx(1727.0, abs=0.1)
    assert adj.mae == pytest.approx(1344.3, abs=0.1)
    coverage = analytics.accuracy("decision", "n2ex", 24, "calibrated")["band_coverage_pct"]
    assert coverage == pytest.approx(80.2, abs=0.1)
