"""API contract tests against the committed January 2026 snapshot."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.api.schemas import GateId
from app.config import Settings
from app.domain.market import GATE_CLOSURES
from app.main import create_app


def _t(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_gate_literal_matches_domain():
    assert set(GateId.__args__) == set(GATE_CLOSURES)


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.json() == {"status": "ok"}
    assert "Cache-Control" not in response.headers


def test_meta_describes_january_window(client: TestClient):
    body = client.get("/api/meta").json()
    assert body["decision_dates"][0] == "2026-01-01"
    assert body["decision_dates"][-1] == "2026-01-31"
    assert body["delivery_start"] == "2026-01-01T23:00:00Z"
    assert body["delivery_end"] == "2026-02-01T23:00:00Z"
    assert {g["id"] for g in body["gates"]} == {"n2ex", "epex"}


def test_decision_view_only_uses_information_available_at_gate(client: TestClient):
    response = client.get("/api/decisions/2026-01-15", params={"gate": "n2ex"})
    assert response.status_code == 200
    assert "public" in response.headers["Cache-Control"]
    body = response.json()

    gate = _t(body["gate_closure"])
    assert body["delivery_date"] == "2026-01-16"
    assert _t(body["forecast_run"]["publish_time"]) <= gate
    assert all(_t(run) <= gate for run in body["forecast_run"]["runs_used"])
    assert _t(body["calibration"]["as_of"]) == gate

    known = [p for p in body["series"] if p["actual_known"]]
    assert known, "some outturn is always known by gate closure"
    assert all(_t(p["t"]) < gate for p in known)

    delivery = [p for p in body["series"] if body["delivery_start"] <= p["t"] < body["delivery_end"]]
    assert len(delivery) == 48
    assert sum(p["calibrated"] is not None for p in delivery) == 24  # hourly forecast points

    phases = [v["phase"] for v in body["vintages"]]
    assert phases.count("decision") == 1
    assert all(_t(v["publish_time"]) > gate for v in body["vintages"] if v["phase"] == "after")


def test_epex_gate_uses_an_earlier_run(client: TestClient):
    n2ex = client.get("/api/decisions/2026-01-15", params={"gate": "n2ex"}).json()
    epex = client.get("/api/decisions/2026-01-15", params={"gate": "epex"}).json()
    assert epex["forecast_run"]["publish_time"] < n2ex["forecast_run"]["publish_time"]


def test_navigation_links_at_window_edges(client: TestClient):
    first = client.get("/api/decisions/2026-01-01").json()
    last = client.get("/api/decisions/2026-01-31").json()
    assert first["previous_decision_date"] is None
    assert last["next_decision_date"] is None


@pytest.mark.parametrize("path", ["/api/decisions/2025-12-31", "/api/decisions/2026-02-01"])
def test_dates_outside_pilot_are_404(client: TestClient, path: str):
    assert client.get(path).status_code == 404


def test_unknown_gate_is_422(client: TestClient):
    assert client.get("/api/decisions/2026-01-15", params={"gate": "apx"}).status_code == 422


def test_calendar_has_one_row_per_decision(client: TestClient):
    days = client.get("/api/calendar").json()
    assert len(days) == 31
    assert all(d["actual_gwh"] is not None for d in days)


def test_accuracy_decision_basis(client: TestClient):
    body = client.get("/api/accuracy", params={"basis": "decision", "variant": "raw"}).json()
    assert body["stats"]["n"] == body["expected_points"] == 744
    assert 13 <= body["lead_min_h"] <= body["lead_max_h"] <= 38
    assert len(body["daily"]) == 31
    assert sum(b["count"] for b in body["histogram"]) == 744


def test_accuracy_calibrated_reports_band_coverage(client: TestClient):
    body = client.get("/api/accuracy", params={"variant": "calibrated"}).json()
    assert body["band_coverage_pct"] is not None
    assert all(p["low"] <= p["high"] for p in body["series"] if p["low"] is not None)


def test_accuracy_horizon_basis_and_date_filter(client: TestClient):
    body = client.get(
        "/api/accuracy", params={"basis": "horizon", "horizon_h": 6, "start": "2026-01-10", "end": "2026-01-12"}
    ).json()
    assert body["horizon_h"] == 6
    assert body["lead_min_h"] >= 6
    assert [d["delivery_date"] for d in body["daily"]] == ["2026-01-10", "2026-01-11", "2026-01-12"]


@pytest.mark.parametrize(
    "params",
    [
        {"basis": "horizon", "variant": "calibrated"},
        {"start": "2026-01-20", "end": "2026-01-10"},
        {"horizon_h": 60},
    ],
)
def test_invalid_accuracy_queries_are_422(client: TestClient, params: dict):
    assert client.get("/api/accuracy", params=params).status_code == 422


def test_lead_time_curve_error_grows_with_horizon(client: TestClient):
    curve = client.get("/api/lead-time-curve").json()
    assert [p["horizon_h"] for p in curve] == list(range(49))
    assert curve[36]["mae"] > curve[0]["mae"]


def test_insights_are_generated(client: TestClient):
    insights = client.get("/api/insights").json()
    assert {i["id"] for i in insights} >= {"bias", "calibration", "range", "lead"}


def test_csv_exports(client: TestClient):
    decision = client.get("/api/export/decisions/2026-01-15.csv")
    assert decision.headers["content-type"].startswith("text/csv")
    assert decision.text.splitlines()[0].startswith("time_utc,actual_mw")

    accuracy = client.get("/api/export/accuracy.csv", params={"variant": "calibrated"})
    assert "error_mw" in accuracy.text.splitlines()[0]


def test_openapi_is_published(client: TestClient):
    assert "/api/decisions/{decision_date}" in client.get("/api/openapi.json").json()["paths"]


def test_frontend_is_served_with_spa_fallback(tmp_path, analytics):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    app_client = TestClient(create_app(Settings(static_dir=tmp_path), analytics))

    assert app_client.get("/").text == "<html>app</html>"
    assert app_client.get("/accuracy").text == "<html>app</html>"
    assert app_client.get("/assets/app.js").text == "console.log(1)"
    assert app_client.get("/favicon.svg").text == "<svg/>"
    assert app_client.get("/api/nope").status_code == 404
    assert app_client.get("/../../etc/passwd").text == "<html>app</html>"
