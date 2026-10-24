"""Builds the views the product shows from the dataset.

This layer only orchestrates: the rules live in ``app.domain``. Results that are
reused across requests (selected forecasts, calibrations) are memoised per
instance; the dataset is immutable once loaded, so the caches never go stale.
"""

from __future__ import annotations

import functools
from dataclasses import asdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal

import numpy as np
import pandas as pd

from app.config import Settings
from app.data.store import Dataset
from app.domain import calibration as cal
from app.domain.market import (
    GATE_CLOSURES,
    UK_TZ,
    delivery_dates,
    delivery_window_utc,
    gate_closure_utc,
    get_gate,
)
from app.domain.metrics import (
    ErrorStats,
    by_forecast_level,
    by_local_hour,
    energy_by_delivery_day,
    error_stats,
    histogram,
    pair,
)
from app.domain.selection import decision_forecast, horizon_forecast

Basis = Literal["decision", "horizon"]
Variant = Literal["raw", "calibrated"]

HORIZONS_H = list(range(0, 49))
VINTAGE_LOOKBACK = pd.Timedelta(hours=48)
HALF_HOUR_H = 0.5
HOUR_H = 1.0
MWH_PER_GWH = 1_000


class NotInWindowError(LookupError):
    """A requested date lies outside the pilot window (HTTP 404)."""


class InvalidRequestError(ValueError):
    """A request that is well-formed but asks for something undefined (HTTP 422)."""


class WindAnalytics:
    def __init__(self, dataset: Dataset, settings: Settings) -> None:
        self.dataset = dataset
        self.window_days = settings.calibration_window_days
        self.decision_dates: list[date] = [
            settings.decision_start + timedelta(days=i)
            for i in range((settings.decision_end - settings.decision_start).days + 1)
        ]
        self.delivery_dates = [d + timedelta(days=1) for d in self.decision_dates]
        self.start = pd.Timestamp(delivery_window_utc(self.delivery_dates[0])[0])
        self.end = pd.Timestamp(delivery_window_utc(self.delivery_dates[-1])[1])

        actuals = dataset.actuals.set_index("target_time")
        self.actual_mw: pd.Series = actuals["actual_mw"]
        self.actual_published: pd.Series = actuals["publish_time"]
        self._training = cal.training_pairs(dataset.forecasts, dataset.actuals)

        self.calibrations = functools.cache(self._calibrations)
        self.decision_frame = functools.cache(self._decision_frame)
        self.horizon_frame = functools.cache(self._horizon_frame)

    # ------------------------------------------------------------------ frames

    def _calibrations(self, gate_id: str) -> dict[date, cal.Calibration]:
        gate = get_gate(gate_id)
        return {
            d: cal.fit(self._training, pd.Timestamp(gate_closure_utc(d, gate)), self.window_days)
            for d in self.decision_dates
        }

    def _decision_frame(self, gate_id: str) -> pd.DataFrame:
        """Forecast in hand at gate closure for every delivery hour, plus calibration."""
        frame = decision_forecast(self.dataset.forecasts, get_gate(gate_id), self.start, self.end)
        frame = self._with_dates(frame)
        calibrations = self.calibrations(gate_id)
        adjusted = pd.concat(
            cal.apply(group["forecast_mw"], calibrations[d]) for d, group in frame.groupby("decision_date")
        )
        frame = frame.join(adjusted)
        frame["cal_factor"] = frame["decision_date"].map(lambda d: calibrations[d].factor)
        return frame

    def _horizon_frame(self, horizon_h: float) -> pd.DataFrame:
        return self._with_dates(horizon_forecast(self.dataset.forecasts, horizon_h, self.start, self.end))

    def _with_dates(self, frame: pd.DataFrame) -> pd.DataFrame:
        frame = frame.copy()
        frame["delivery_date"] = delivery_dates(frame.index.to_series()).to_numpy()
        frame["decision_date"] = [d - timedelta(days=1) for d in frame["delivery_date"]]
        frame["actual_mw"] = self.actual_mw.reindex(frame.index)
        return frame

    def _basis_frame(self, basis: Basis, gate_id: str, horizon_h: float) -> pd.DataFrame:
        return self.decision_frame(gate_id) if basis == "decision" else self.horizon_frame(horizon_h)

    def _actuals_between(self, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
        idx = self.actual_mw.index
        return self.actual_mw[(idx >= start) & (idx < end)]

    def _days_window(self, start: date | None, end: date | None) -> tuple[date, date]:
        first, last = start or self.delivery_dates[0], end or self.delivery_dates[-1]
        if first > last:
            raise InvalidRequestError("start must not be after end")
        if first < self.delivery_dates[0] or last > self.delivery_dates[-1]:
            raise NotInWindowError(
                f"Delivery dates must be within {self.delivery_dates[0]} .. {self.delivery_dates[-1]}"
            )
        return first, last

    def check_decision_date(self, decision_date: date) -> None:
        if decision_date not in self.decision_dates:
            raise NotInWindowError(
                f"Decision date must be within {self.decision_dates[0]} .. {self.decision_dates[-1]}"
            )

    # ------------------------------------------------------------------ views

    def meta(self) -> dict[str, Any]:
        f, a = self.dataset.forecasts, self.dataset.actuals
        return {
            "product": "WindDesk",
            "data": {
                "source": self.dataset.source,
                "fetched_at": _iso(pd.Timestamp(self.dataset.fetched_at)),
                "forecast_runs": int(f["publish_time"].nunique()),
                "forecast_rows": len(f),
                "actual_rows": len(a),
                "first_actual": _iso(a["target_time"].min()),
                "last_actual": _iso(a["target_time"].max()),
            },
            "decision_dates": [d.isoformat() for d in self.decision_dates],
            "delivery_start": _iso(self.start),
            "delivery_end": _iso(self.end),
            "gates": [
                {
                    "id": g.id,
                    "label": g.label,
                    "local_time": g.local_time.strftime("%H:%M"),
                    "description": g.description,
                }
                for g in GATE_CLOSURES.values()
            ],
            "horizons_h": HORIZONS_H,
            "calibration": {
                "window_days": self.window_days,
                "lead_range_h": list(cal.LEAD_RANGE_H),
                "band_quantiles": list(cal.BAND_QUANTILES),
            },
        }

    def decision_view(self, decision_date: date, gate_id: str) -> dict[str, Any]:
        self.check_decision_date(decision_date)
        gate = get_gate(gate_id)
        delivery = decision_date + timedelta(days=1)
        gate_time = pd.Timestamp(gate_closure_utc(decision_date, gate))
        d_start, d_end = (pd.Timestamp(t) for t in delivery_window_utc(delivery))
        view_start = pd.Timestamp(datetime.combine(decision_date, time(0), tzinfo=UK_TZ)).tz_convert(UTC)

        frame = self.decision_frame(gate_id)
        day = frame[frame["delivery_date"] == delivery]
        calibration = self.calibrations(gate_id)[decision_date]
        decision_run = day["publish_time"].max()

        forecasts = self.dataset.forecasts
        run_values = forecasts[forecasts["publish_time"] == decision_run].set_index("target_time")["forecast_mw"]

        grid = pd.date_range(view_start, d_end, freq="30min", inclusive="left", unit="ns")
        published = self.actual_published.reindex(grid)
        series = pd.DataFrame(
            {
                "actual": self.actual_mw.reindex(grid),
                "actual_known": (published <= gate_time).fillna(False).astype(bool),
                "forecast": run_values.reindex(grid),
                "calibrated": day["calibrated_mw"].reindex(grid),
                "low": day["low_mw"].reindex(grid),
                "high": day["high_mw"].reindex(grid),
            },
            index=grid,
        )
        series.loc[day.index, "forecast"] = day["forecast_mw"]

        vintages = self._vintages(d_start, d_end, gate_time, decision_run)
        after_gate = [v for v in vintages if v["phase"] == "after" and v["energy_gwh"] is not None]

        actual_day = self._actuals_between(d_start, d_end)
        actual_complete = len(actual_day) == round((d_end - d_start) / pd.Timedelta(minutes=30))
        peak_at = day["calibrated_mw"].idxmax()
        trough_at = day["calibrated_mw"].idxmin()
        idx = self.decision_dates.index(decision_date)

        return {
            "decision_date": decision_date.isoformat(),
            "delivery_date": delivery.isoformat(),
            "gate": gate.id,
            "gate_closure": _iso(gate_time),
            "delivery_start": _iso(d_start),
            "delivery_end": _iso(d_end),
            "view_start": _iso(view_start),
            "previous_decision_date": self.decision_dates[idx - 1].isoformat() if idx > 0 else None,
            "next_decision_date": (
                self.decision_dates[idx + 1].isoformat() if idx + 1 < len(self.decision_dates) else None
            ),
            "forecast_run": {
                "publish_time": _iso(decision_run),
                "minutes_before_gate": int((gate_time - decision_run) / pd.Timedelta(minutes=1)),
                "lead_min_h": _r(day["lead_h"].min()),
                "lead_max_h": _r(day["lead_h"].max()),
                "runs_used": [_iso(t) for t in sorted(day["publish_time"].unique())],
            },
            "calibration": _calibration_dict(calibration),
            "energy": {
                "forecast_gwh": _gwh(day["forecast_mw"].sum() * HOUR_H),
                "calibrated_gwh": _gwh(day["calibrated_mw"].sum() * HOUR_H),
                "low_gwh": _gwh(day["low_mw"].sum(min_count=1) * HOUR_H),
                "high_gwh": _gwh(day["high_mw"].sum(min_count=1) * HOUR_H),
                "actual_gwh": _gwh(actual_day.sum() * HALF_HOUR_H) if actual_complete else None,
                "latest_before_delivery_gwh": after_gate[-1]["energy_gwh"] if after_gate else None,
            },
            "peak": {"time": _iso(peak_at), "mw": _r(day.loc[peak_at, "calibrated_mw"])},
            "trough": {"time": _iso(trough_at), "mw": _r(day.loc[trough_at, "calibrated_mw"])},
            "stats": {
                "raw": _stats(error_stats(pair(day["forecast_mw"], self.actual_mw))),
                "calibrated": _stats(error_stats(pair(day["calibrated_mw"], self.actual_mw))),
            },
            "series": [
                {
                    "t": _iso(t),
                    "actual": _r(row.actual),
                    "actual_known": bool(row.actual_known),
                    "forecast": _r(row.forecast),
                    "calibrated": _r(row.calibrated),
                    "low": _r(row.low),
                    "high": _r(row.high),
                }
                for t, row in series.iterrows()
            ],
            "vintages": vintages,
        }

    def _vintages(
        self, d_start: pd.Timestamp, d_end: pd.Timestamp, gate_time: pd.Timestamp, decision_run: pd.Timestamp
    ) -> list[dict[str, Any]]:
        """Every run published in the 48h before delivery, clipped to the delivery window."""
        f = self.dataset.forecasts
        rows = f[
            (f["publish_time"] >= d_start - VINTAGE_LOOKBACK)
            & (f["publish_time"] <= d_start)
            & (f["target_time"] >= d_start)
            & (f["target_time"] < d_end)
        ]
        expected = round((d_end - d_start) / pd.Timedelta(hours=1))
        out = []
        for publish_time, run in rows.groupby("publish_time"):
            if publish_time == decision_run:
                phase = "decision"
            elif publish_time > gate_time:
                phase = "after"
            else:
                phase = "before"
            out.append(
                {
                    "publish_time": _iso(publish_time),
                    "phase": phase,
                    "hours_before_delivery": _r((d_start - publish_time) / pd.Timedelta(hours=1)),
                    "energy_gwh": _gwh(run["forecast_mw"].sum() * HOUR_H) if len(run) == expected else None,
                    "points": [
                        {"t": _iso(t), "mw": _r(v)} for t, v in zip(run["target_time"], run["forecast_mw"], strict=True)
                    ],
                }
            )
        return out

    def calendar(self, gate_id: str) -> list[dict[str, Any]]:
        frame = self.decision_frame(gate_id)
        actual_energy = energy_by_delivery_day(self._actuals_between(self.start, self.end), HALF_HOUR_H)
        out = []
        for delivery, day in frame.groupby("delivery_date"):
            actual = actual_energy["mwh"].get(delivery)
            raw = error_stats(pair(day["forecast_mw"], self.actual_mw))
            adj = error_stats(pair(day["calibrated_mw"], self.actual_mw))
            forecast_mwh = day["forecast_mw"].sum() * HOUR_H
            calibrated_mwh = day["calibrated_mw"].sum() * HOUR_H
            out.append(
                {
                    "decision_date": (delivery - timedelta(days=1)).isoformat(),
                    "delivery_date": delivery.isoformat(),
                    "forecast_gwh": _gwh(forecast_mwh),
                    "calibrated_gwh": _gwh(calibrated_mwh),
                    "actual_gwh": _gwh(actual),
                    "forecast_error_pct": _pct(forecast_mwh, actual),
                    "calibrated_error_pct": _pct(calibrated_mwh, actual),
                    "raw_mae": _r(raw.mae) if raw else None,
                    "calibrated_mae": _r(adj.mae) if adj else None,
                }
            )
        return out

    def accuracy(
        self,
        basis: Basis,
        gate_id: str,
        horizon_h: float,
        variant: Variant,
        start: date | None = None,
        end: date | None = None,
    ) -> dict[str, Any]:
        if basis == "horizon" and variant == "calibrated":
            raise InvalidRequestError("The calibrated forecast is defined for the day-ahead decision basis only")
        first, last = self._days_window(start, end)
        frame = self._basis_frame(basis, gate_id, horizon_h)
        frame = frame[(frame["delivery_date"] >= first) & (frame["delivery_date"] <= last)]
        column = "calibrated_mw" if variant == "calibrated" else "forecast_mw"
        pairs = pair(frame[column], self.actual_mw)
        stats = error_stats(pairs)

        coverage = None
        if variant == "calibrated":
            banded = frame.dropna(subset=["low_mw", "high_mw", "actual_mw"])
            if not banded.empty:
                inside = banded["actual_mw"].between(banded["low_mw"], banded["high_mw"])
                coverage = _r(100 * inside.mean())

        target_index = self._target_index(first, last)
        win_start, win_end = target_index[0], target_index[-1] + pd.Timedelta(hours=1)
        actual_energy = energy_by_delivery_day(self._actuals_between(win_start, win_end), HALF_HOUR_H)["mwh"]
        forecast_energy = energy_by_delivery_day(frame[column], HOUR_H)["mwh"]
        daily_mae = pairs["error"].abs().groupby(delivery_dates(pairs.index.to_series()).to_numpy()).mean()
        daily = []
        for d, forecast_mwh in forecast_energy.items():
            actual_mwh = actual_energy.get(d, np.nan)
            daily.append(
                {
                    "delivery_date": d.isoformat(),
                    "forecast_gwh": _gwh(forecast_mwh),
                    "actual_gwh": _gwh(actual_mwh),
                    "error_gwh": _gwh(forecast_mwh - actual_mwh),
                    "error_pct": _pct(forecast_mwh, actual_mwh),
                    "mae": _r(daily_mae.get(d)),
                }
            )
        energy_errors = [row["error_gwh"] for row in daily if row["error_gwh"] is not None]

        aligned = frame.reindex(target_index)
        has_band = variant == "calibrated"
        return {
            "basis": basis,
            "variant": variant,
            "gate": gate_id,
            "horizon_h": horizon_h if basis == "horizon" else None,
            "start": first.isoformat(),
            "end": last.isoformat(),
            "lead_min_h": _r(frame["lead_h"].min()),
            "lead_max_h": _r(frame["lead_h"].max()),
            "expected_points": len(target_index),
            "stats": _stats(stats),
            "band_coverage_pct": coverage,
            "daily_energy_mae_gwh": _r(np.mean(np.abs(energy_errors)), 2) if energy_errors else None,
            "daily_energy_bias_gwh": _r(np.mean(energy_errors), 2) if energy_errors else None,
            "histogram": histogram(pairs["error"]),
            "by_hour": _records(by_local_hour(pairs).reset_index()),
            "by_level": _records(by_forecast_level(pairs)),
            "daily": daily,
            "series": [
                {
                    "t": _iso(t),
                    "forecast": _r(row[column]),
                    "actual": _r(self.actual_mw.get(t)),
                    "low": _r(row["low_mw"]) if has_band else None,
                    "high": _r(row["high_mw"]) if has_band else None,
                }
                for t, row in aligned.iterrows()
            ],
        }

    def _target_index(self, first: date, last: date) -> pd.DatetimeIndex:
        start = pd.Timestamp(delivery_window_utc(first)[0])
        end = pd.Timestamp(delivery_window_utc(last)[1])
        return pd.date_range(start, end, freq="1h", inclusive="left", unit="ns")

    def lead_time_curve(self, start: date | None = None, end: date | None = None) -> list[dict[str, Any]]:
        first, last = self._days_window(start, end)
        expected = len(self._target_index(first, last))
        out = []
        for h in HORIZONS_H:
            frame = self.horizon_frame(h)
            frame = frame[(frame["delivery_date"] >= first) & (frame["delivery_date"] <= last)]
            stats = error_stats(pair(frame["forecast_mw"], self.actual_mw))
            out.append(
                {
                    "horizon_h": h,
                    "n": stats.n if stats else 0,
                    "coverage_pct": _r(100 * (stats.n if stats else 0) / expected),
                    "mae": _r(stats.mae) if stats else None,
                    "rmse": _r(stats.rmse) if stats else None,
                    "bias": _r(stats.bias) if stats else None,
                    "p90_abs": _r(stats.p90_abs) if stats else None,
                }
            )
        return out

    def export_decision_csv(self, decision_date: date, gate_id: str) -> str:
        view = self.decision_view(decision_date, gate_id)
        df = pd.DataFrame(view["series"]).rename(
            columns={
                "t": "time_utc",
                "actual": "actual_mw",
                "actual_known": "actual_known_at_gate",
                "forecast": "forecast_mw",
                "calibrated": "calibrated_mw",
                "low": "range_low_mw",
                "high": "range_high_mw",
            }
        )
        return df.to_csv(index=False)

    def export_accuracy_csv(self, **params: Any) -> str:
        view = self.accuracy(**params)
        df = pd.DataFrame(view["series"]).rename(columns={"t": "time_utc"})
        df["error_mw"] = df["forecast"] - df["actual"]
        return df.to_csv(index=False)

    # --------------------------------------------------------------- insights

    def insights(self, gate_id: str) -> list[dict[str, Any]]:
        """Plain-language findings for the whole pilot window, computed not written."""
        frame = self.decision_frame(gate_id)
        raw = error_stats(pair(frame["forecast_mw"], self.actual_mw))
        adj = error_stats(pair(frame["calibrated_mw"], self.actual_mw))
        if raw is None or adj is None:
            return []
        gate = get_gate(gate_id)
        levels = by_forecast_level(pair(frame["forecast_mw"], self.actual_mw))
        top = levels.iloc[-1]
        calendar = [row for row in self.calendar(gate_id) if row["forecast_error_pct"] is not None]
        worst = max(calendar, key=lambda row: abs(row["forecast_error_pct"]))
        curve = {row["horizon_h"]: row for row in self.lead_time_curve()}
        banded = frame.dropna(subset=["low_mw", "high_mw", "actual_mw"])
        coverage = banded["actual_mw"].between(banded["low_mw"], banded["high_mw"]).mean()

        others = {
            g: error_stats(pair(self.decision_frame(g)["forecast_mw"], self.actual_mw))
            for g in GATE_CLOSURES
            if g != gate_id
        }

        out = [
            {
                "id": "bias",
                "tone": "risk",
                "headline": f"Forecasts ran {raw.bias_pct:.0f}% high",
                "detail": (
                    f"At {gate.label} gate closure, the forecast in hand over-estimated wind in "
                    f"{raw.over_forecast_share:.0%} of delivery hours, by {raw.bias / 1000:.2f} GW on average. "
                    "Taken at face value it leads to systematic under-buying."
                ),
            },
            {
                "id": "level",
                "tone": "info",
                "headline": f"Only {top['ratio']:.0%} of high-wind forecasts delivered",
                "detail": (
                    f"When at least {top['lo'] / 1000:.0f} GW was forecast, metered output averaged "
                    f"{top['ratio']:.0%} of the forecast, against {levels.iloc[0]['ratio']:.0%} in the lowest band. "
                    "The gap scales with wind, consistent with output being curtailed in high-wind periods."
                ),
            },
            {
                "id": "calibration",
                "tone": "opportunity",
                "headline": f"Calibration cuts error by {1 - adj.mae / raw.mae:.0%}",
                "detail": (
                    f"A trailing {self.window_days}-day calibration, using only data published before gate "
                    f"closure, reduces MAE from {raw.mae / 1000:.2f} to {adj.mae / 1000:.2f} GW and bias from "
                    f"{raw.bias / 1000:+.2f} to {adj.bias / 1000:+.2f} GW."
                ),
            },
            {
                "id": "range",
                "tone": "info",
                "headline": f"80% range held {coverage:.0%} of outcomes",
                "detail": (
                    "The calibrated range is built from the same trailing window. Coverage close to 80% means "
                    "it can be used directly to size a shortfall buffer."
                ),
            },
            {
                "id": "lead",
                "tone": "info",
                "headline": "Deciding a day ahead costs accuracy",
                "detail": (
                    f"MAE is {curve[1]['mae'] / 1000:.2f} GW for forecasts 1 hour ahead and "
                    f"{curve[36]['mae'] / 1000:.2f} GW at 36 hours. Day-ahead decisions sit at "
                    f"{frame['lead_h'].min():.0f}–{frame['lead_h'].max():.0f} hours."
                ),
            },
            {
                "id": "worst",
                "tone": "risk",
                "headline": f"Largest miss: {_day_label(date.fromisoformat(worst['delivery_date']))}",
                "detail": (
                    f"Forecast {worst['forecast_gwh']:.0f} GWh against {worst['actual_gwh']:.0f} GWh delivered "
                    f"({worst['forecast_error_pct']:+.0f}%). Calibrated: {worst['calibrated_error_pct']:+.0f}%."
                ),
            },
        ]
        for other_id, other in others.items():
            if other is None:
                continue
            other_gate = get_gate(other_id)
            run_times = {
                g: sorted({t.tz_convert(UK_TZ).strftime("%H:%M") for t in self.decision_frame(g)["publish_time"]})
                for g in (gate_id, other_id)
            }
            out.append(
                {
                    "id": f"gate-{other_id}",
                    "tone": "info",
                    "headline": f"{other_gate.label} vs {gate.label}",
                    "detail": (
                        f"Bidding at {other_gate.label} uses the {', '.join(run_times[other_id])} run instead of "
                        f"{', '.join(run_times[gate_id])}. MAE {other.mae / 1000:.2f} GW vs {raw.mae / 1000:.2f} GW."
                    ),
                }
            )
        return out


# ---------------------------------------------------------------- formatting


def _iso(ts: pd.Timestamp | datetime) -> str:
    return pd.Timestamp(ts).tz_convert(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _r(value: Any, digits: int = 1) -> float | None:
    if value is None:
        return None
    value = float(value)
    return None if np.isnan(value) else round(value, digits)


def _gwh(mwh: Any) -> float | None:
    value = _r(mwh)
    return None if value is None else round(value / MWH_PER_GWH, 2)


def _pct(forecast: Any, actual: Any) -> float | None:
    if actual is None or forecast is None or np.isnan(actual) or actual == 0:
        return None
    return round(100 * (float(forecast) - float(actual)) / float(actual), 1)


def _stats(stats: ErrorStats | None) -> dict[str, Any] | None:
    if stats is None:
        return None
    fine = {"corr", "over_forecast_share"}
    return {k: v if k == "n" else _r(v, 3 if k in fine else 1) for k, v in asdict(stats).items()}


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{k: (int(v) if k in {"n", "hour"} else _r(v, 3)) for k, v in row.items()} for row in df.to_dict("records")]


def _calibration_dict(c: cal.Calibration) -> dict[str, Any]:
    return {
        "applied": c.applied,
        "factor": _r(c.factor, 3),
        "ratio_low": _r(c.ratio_low, 3),
        "ratio_high": _r(c.ratio_high, 3),
        "n": c.n,
        "window_start": _iso(c.window_start),
        "as_of": _iso(c.as_of),
    }


def _day_label(d: date) -> str:
    return f"{d:%a} {d.day} {d:%b}"
