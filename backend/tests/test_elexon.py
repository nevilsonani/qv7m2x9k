from datetime import UTC, date, datetime

import httpx
import pytest

from app.data import elexon
from app.data.elexon import ElexonClient, ElexonError


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(elexon.time, "sleep", lambda _: None)


def _client(handler) -> ElexonClient:
    http = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(handler))
    return ElexonClient("https://example.test", http=http)


def test_forecasts_are_chunked_weekly_and_deduplicated():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(dict(request.url.params))
        row = {"publishTime": "2026-01-08T00:00:00Z", "startTime": "2026-01-08T01:00:00Z", "generation": 5}
        return httpx.Response(200, json=[row])  # same row in every chunk

    with _client(handler) as client:
        df = client.wind_forecasts(datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC))

    assert [c["publishDateTimeFrom"] for c in calls] == ["2026-01-01T00:00:00Z", "2026-01-08T00:00:00Z"]
    assert len(df) == 1
    assert list(df.columns) == ["publish_time", "target_time", "forecast_mw"]


def test_actuals_keep_wind_only_and_latest_publication():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["fuelType"] == "WIND"
        return httpx.Response(
            200,
            json=[
                {
                    "publishTime": "2026-01-01T00:30:00Z",
                    "startTime": "2026-01-01T00:00:00Z",
                    "fuelType": "WIND",
                    "generation": 1,
                },
                {
                    "publishTime": "2026-01-01T01:30:00Z",
                    "startTime": "2026-01-01T00:00:00Z",
                    "fuelType": "WIND",
                    "generation": 2,
                },
                {
                    "publishTime": "2026-01-01T00:30:00Z",
                    "startTime": "2026-01-01T00:00:00Z",
                    "fuelType": "CCGT",
                    "generation": 9,
                },
            ],
        )

    with _client(handler) as client:
        df = client.wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    assert df["actual_mw"].tolist() == [2]


def test_retries_transient_errors():
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(503) if len(attempts) < 3 else httpx.Response(200, json=[])

    with _client(handler) as client:
        assert client.wind_actuals(date(2026, 1, 1), date(2026, 1, 1)).empty
    assert len(attempts) == 3


def test_client_errors_are_not_retried():
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(400, text="bad request")

    with _client(handler) as client, pytest.raises(ElexonError, match="400"):
        client.wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    assert len(attempts) == 1


def test_schema_drift_fails_loudly():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"publishTime": "2026-01-01T00:00:00Z", "startTime": "x"}])

    with _client(handler) as client, pytest.raises(ValueError):
        client.wind_forecasts(datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC))
