from datetime import UTC, date, datetime

import pandas as pd

from app.config import Settings
from app.data import store
from app.data.store import FetchWindow, RawData, load_dataset, load_raw, save_snapshot


def _raw() -> RawData:
    return RawData(
        forecasts=pd.DataFrame(
            {
                "publish_time": pd.to_datetime(["2026-01-01T09:30Z", "2026-01-01T09:30Z"], utc=True),
                "target_time": pd.to_datetime(["2026-01-01T08:00Z", "2026-01-02T00:00Z"], utc=True),
                "forecast_mw": [1.0, 2.0],
            }
        ),
        actuals=pd.DataFrame(
            {
                "target_time": pd.to_datetime(["2026-01-02T00:00Z"], utc=True),
                "actual_mw": [3.0],
                "publish_time": pd.to_datetime(["2026-01-02T00:30Z"], utc=True),
            }
        ),
        fetched_at=datetime(2026, 10, 1, tzinfo=UTC),
    )


def test_fetch_window_includes_warmup_and_last_delivery_day():
    window = FetchWindow.for_settings(Settings())
    assert window.publish_from == datetime(2025, 12, 25, tzinfo=UTC)
    assert window.publish_to == datetime(2026, 2, 1, 23, tzinfo=UTC)
    assert window.settlement_to == date(2026, 2, 1)


def test_snapshot_round_trip_keeps_raw_rows(tmp_path):
    save_snapshot(_raw(), tmp_path, Settings())
    raw = load_raw(tmp_path)
    assert len(raw.forecasts) == 2  # backward-looking row is kept in the snapshot...
    dataset = load_dataset(Settings(data_mode="snapshot", snapshot_dir=tmp_path))
    assert dataset.forecasts["forecast_mw"].tolist() == [2.0]  # ...and dropped on load
    assert dataset.fetched_at == datetime(2026, 10, 1, tzinfo=UTC)


def test_live_mode_fetches_once_then_uses_cache(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(store, "fetch_raw", lambda settings: calls.append(1) or _raw())
    settings = Settings(data_mode="live", cache_dir=tmp_path / "cache")

    first = load_dataset(settings)
    second = load_dataset(settings)

    assert len(calls) == 1
    assert first.source == second.source == "elexon-live"
    assert second.actuals["actual_mw"].tolist() == [3.0]
