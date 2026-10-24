import pandas as pd

from app.domain.market import GATE_CLOSURES
from app.domain.selection import decision_forecast, horizon_forecast, select_as_of
from tests.conftest import forecasts, ts

RUNS = forecasts(
    ("2026-01-15T07:30Z", "2026-01-16T00:00Z", 100),
    ("2026-01-15T07:30Z", "2026-01-16T01:00Z", 110),
    ("2026-01-15T09:30Z", "2026-01-16T00:00Z", 200),
    ("2026-01-15T09:30Z", "2026-01-16T01:00Z", 210),
    ("2026-01-15T11:30Z", "2026-01-16T00:00Z", 300),  # after the 09:50 gate: must never be used
    ("2026-01-15T11:30Z", "2026-01-16T01:00Z", 310),
)


def test_picks_latest_run_at_or_before_cutoff():
    cutoffs = pd.Series([ts("2026-01-15T09:50Z")], index=pd.DatetimeIndex([ts("2026-01-16T00:00Z")]))
    picked = select_as_of(RUNS, cutoffs)
    assert picked.loc[ts("2026-01-16T00:00Z"), "forecast_mw"] == 200
    assert picked.loc[ts("2026-01-16T00:00Z"), "lead_h"] == 14.5


def test_cutoff_is_inclusive():
    cutoffs = pd.Series([ts("2026-01-15T09:30Z")], index=pd.DatetimeIndex([ts("2026-01-16T00:00Z")]))
    assert select_as_of(RUNS, cutoffs)["forecast_mw"].item() == 200


def test_falls_back_to_older_run_when_latest_does_not_cover_target():
    runs = pd.concat(
        [RUNS, forecasts(("2026-01-15T09:40Z", "2026-01-16T00:00Z", 999))]  # newer run, missing 01:00
    )
    targets = pd.DatetimeIndex([ts("2026-01-16T00:00Z"), ts("2026-01-16T01:00Z")])
    cutoffs = pd.Series(ts("2026-01-15T09:50Z"), index=targets)
    picked = select_as_of(runs, cutoffs)["forecast_mw"]
    assert picked.tolist() == [999, 210]


def test_target_without_eligible_run_is_absent():
    cutoffs = pd.Series([ts("2026-01-15T06:00Z")], index=pd.DatetimeIndex([ts("2026-01-16T00:00Z")]))
    assert select_as_of(RUNS, cutoffs).empty


def test_decision_basis_respects_gate_closure():
    epex = decision_forecast(RUNS, GATE_CLOSURES["epex"], ts("2026-01-15T23:00Z"), ts("2026-01-16T23:00Z"))
    n2ex = decision_forecast(RUNS, GATE_CLOSURES["n2ex"], ts("2026-01-15T23:00Z"), ts("2026-01-16T23:00Z"))
    assert epex["forecast_mw"].tolist() == [100, 110]  # 09:20 gate only sees the 07:30 run
    assert n2ex["forecast_mw"].tolist() == [200, 210]


def test_horizon_basis_uses_target_minus_horizon():
    picked = horizon_forecast(RUNS, 14, ts("2026-01-16T00:00Z"), ts("2026-01-16T02:00Z"))
    # 00:00 - 14h = 10:00 → 09:30 run; 01:00 - 14h = 11:00 → still 09:30 run.
    assert picked["forecast_mw"].tolist() == [200, 210]
    assert (picked["lead_h"] >= 14).all()


def test_backward_looking_rows_are_dropped_on_load():
    runs = forecasts(("2026-01-15T09:30Z", "2026-01-15T08:00Z", 1), ("2026-01-15T09:30Z", "2026-01-15T10:00Z", 2))
    assert runs["forecast_mw"].tolist() == [2]
