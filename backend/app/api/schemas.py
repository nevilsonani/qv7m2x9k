"""Response models. They define the public API contract and generate the OpenAPI
schema the frontend's TypeScript types are generated from (``npm run gen:api``).

Units: power in MW, energy in GWh, times in UTC (ISO 8601), errors are
forecast minus actual.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

GateId = Literal["n2ex", "epex"]
Basis = Literal["decision", "horizon"]
Variant = Literal["raw", "calibrated"]


class ErrorStats(BaseModel):
    n: int
    mae: float = Field(description="Mean absolute error, MW")
    rmse: float
    bias: float = Field(description="Mean error (forecast - actual), MW. Positive = over-forecast")
    mean_actual: float
    mean_forecast: float
    nmae_pct: float = Field(description="MAE as % of mean actual generation")
    bias_pct: float
    p10: float = Field(description="10th percentile of error, MW")
    p50: float
    p90: float
    p90_abs: float = Field(description="90th percentile of absolute error, MW")
    max_abs: float
    over_forecast_share: float = Field(description="Share of periods where forecast > actual")
    corr: float | None


class DataInfo(BaseModel):
    source: str
    fetched_at: datetime
    forecast_runs: int
    forecast_rows: int
    actual_rows: int
    first_actual: datetime
    last_actual: datetime


class Gate(BaseModel):
    id: GateId
    label: str
    local_time: str
    description: str


class CalibrationSettings(BaseModel):
    window_days: int
    lead_range_h: list[float]
    band_quantiles: list[float]


class Meta(BaseModel):
    product: str
    data: DataInfo
    decision_dates: list[date]
    delivery_start: datetime
    delivery_end: datetime
    gates: list[Gate]
    horizons_h: list[int]
    calibration: CalibrationSettings


class ForecastRun(BaseModel):
    publish_time: datetime
    minutes_before_gate: int
    lead_min_h: float
    lead_max_h: float
    runs_used: list[datetime]


class Calibration(BaseModel):
    applied: bool
    factor: float = Field(description="Multiplier applied to the raw forecast")
    ratio_low: float | None = Field(description="P10 of actual/forecast in the window")
    ratio_high: float | None = Field(description="P90 of actual/forecast in the window")
    n: int = Field(description="Forecast/actual pairs in the window")
    window_start: datetime
    as_of: datetime


class DayEnergy(BaseModel):
    forecast_gwh: float
    calibrated_gwh: float
    low_gwh: float | None
    high_gwh: float | None
    actual_gwh: float | None
    latest_before_delivery_gwh: float | None = Field(
        description="Energy in the last run published before delivery starts"
    )


class Extreme(BaseModel):
    time: datetime
    mw: float


class DecisionStats(BaseModel):
    raw: ErrorStats | None
    calibrated: ErrorStats | None


class DecisionPoint(BaseModel):
    t: datetime
    actual: float | None
    actual_known: bool = Field(description="Outturn had been published by gate closure")
    forecast: float | None
    calibrated: float | None
    low: float | None
    high: float | None


class VintagePoint(BaseModel):
    t: datetime
    mw: float


class Vintage(BaseModel):
    publish_time: datetime
    phase: Literal["before", "decision", "after"]
    hours_before_delivery: float
    energy_gwh: float | None = Field(description="Null when the run does not cover the whole day")
    points: list[VintagePoint]


class DecisionView(BaseModel):
    decision_date: date
    delivery_date: date
    gate: GateId
    gate_closure: datetime
    delivery_start: datetime
    delivery_end: datetime
    view_start: datetime
    previous_decision_date: date | None
    next_decision_date: date | None
    forecast_run: ForecastRun
    calibration: Calibration
    energy: DayEnergy
    peak: Extreme
    trough: Extreme
    stats: DecisionStats
    series: list[DecisionPoint]
    vintages: list[Vintage]


class CalendarDay(BaseModel):
    decision_date: date
    delivery_date: date
    forecast_gwh: float
    calibrated_gwh: float
    actual_gwh: float | None
    forecast_error_pct: float | None
    calibrated_error_pct: float | None
    raw_mae: float | None
    calibrated_mae: float | None


class HistogramBin(BaseModel):
    x0: float
    x1: float
    count: int


class HourProfile(BaseModel):
    hour: int
    n: int
    bias: float
    mae: float
    p10: float
    p90: float


class LevelProfile(BaseModel):
    lo: float
    hi: float | None
    n: int
    bias: float
    mae: float
    ratio: float = Field(description="Sum of actual / sum of forecast")


class DailyAccuracy(BaseModel):
    delivery_date: date
    forecast_gwh: float | None
    actual_gwh: float | None
    error_gwh: float | None
    error_pct: float | None
    mae: float | None


class AccuracyPoint(BaseModel):
    t: datetime
    forecast: float | None
    actual: float | None
    low: float | None
    high: float | None


class Accuracy(BaseModel):
    basis: Basis
    variant: Variant
    gate: GateId
    horizon_h: float | None
    start: date
    end: date
    lead_min_h: float | None
    lead_max_h: float | None
    expected_points: int
    stats: ErrorStats | None
    band_coverage_pct: float | None
    daily_energy_mae_gwh: float | None
    daily_energy_bias_gwh: float | None
    histogram: list[HistogramBin]
    by_hour: list[HourProfile]
    by_level: list[LevelProfile]
    daily: list[DailyAccuracy]
    series: list[AccuracyPoint]


class LeadTimePoint(BaseModel):
    horizon_h: int
    n: int
    coverage_pct: float
    mae: float | None
    rmse: float | None
    bias: float | None
    p90_abs: float | None


class Insight(BaseModel):
    id: str
    tone: Literal["risk", "opportunity", "info"]
    headline: str
    detail: str


class Health(BaseModel):
    status: Literal["ok"]
