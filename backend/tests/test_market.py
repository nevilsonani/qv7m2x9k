from datetime import UTC, date, datetime

import pandas as pd

from app.domain.market import (
    GATE_CLOSURES,
    decision_cutoffs,
    delivery_dates,
    delivery_window_utc,
    gate_closure_utc,
)

N2EX = GATE_CLOSURES["n2ex"]


def test_gate_closure_is_uk_local_time_in_winter_and_summer():
    assert gate_closure_utc(date(2026, 1, 15), N2EX) == datetime(2026, 1, 15, 9, 50, tzinfo=UTC)
    # BST (UTC+1): 09:50 UK is 08:50 UTC.
    assert gate_closure_utc(date(2026, 7, 15), N2EX) == datetime(2026, 7, 15, 8, 50, tzinfo=UTC)


def test_delivery_day_runs_23_to_23_uk_time():
    start, end = delivery_window_utc(date(2026, 1, 16))
    assert start == datetime(2026, 1, 15, 23, 0, tzinfo=UTC)
    assert end == datetime(2026, 1, 16, 23, 0, tzinfo=UTC)

    summer_start, summer_end = delivery_window_utc(date(2026, 7, 16))
    assert summer_start == datetime(2026, 7, 15, 22, 0, tzinfo=UTC)
    assert summer_end == datetime(2026, 7, 16, 22, 0, tzinfo=UTC)


def test_delivery_window_on_clock_change_day_is_23_hours():
    start, end = delivery_window_utc(date(2026, 3, 29))  # clocks go forward
    assert end - start == pd.Timedelta(hours=23)


def test_delivery_dates_roll_over_at_23_00_uk():
    times = pd.Series(pd.to_datetime(["2026-01-15T22:30Z", "2026-01-15T23:00Z", "2026-01-16T22:30Z"], utc=True))
    assert list(delivery_dates(times)) == [date(2026, 1, 15), date(2026, 1, 16), date(2026, 1, 16)]


def test_decision_cutoff_is_gate_closure_on_the_day_before_delivery():
    times = pd.Series(pd.to_datetime(["2026-01-15T23:00Z", "2026-01-16T22:00Z"], utc=True))
    cutoffs = decision_cutoffs(times, N2EX)
    assert list(cutoffs) == [pd.Timestamp("2026-01-15T09:50Z")] * 2
