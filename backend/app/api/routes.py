from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse

from app.api.schemas import (
    Accuracy,
    Basis,
    CalendarDay,
    DecisionView,
    GateId,
    Health,
    Insight,
    LeadTimePoint,
    Meta,
    Variant,
)
from app.domain.market import DEFAULT_GATE
from app.services.analytics import WindAnalytics

router = APIRouter(prefix="/api")


def get_analytics(request: Request) -> WindAnalytics:
    return request.app.state.provider.get()


Analytics = Annotated[WindAnalytics, Depends(get_analytics)]
Gate = Annotated[GateId, Query(description="Day-ahead auction whose gate closure defines the decision time")]
Start = Annotated[date | None, Query(description="First delivery date (inclusive)")]
End = Annotated[date | None, Query(description="Last delivery date (inclusive)")]
Horizon = Annotated[float, Query(ge=0, le=48, description="Lead time in hours for the horizon basis")]


@router.get("/health", response_model=Health)
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta", response_model=Meta)
def meta(analytics: Analytics) -> dict:
    return analytics.meta()


@router.get("/decisions/{decision_date}", response_model=DecisionView)
def decision(analytics: Analytics, decision_date: date, gate: Gate = DEFAULT_GATE) -> dict:
    """What the desk knew at gate closure on ``decision_date``, and what happened next."""
    return analytics.decision_view(decision_date, gate)


@router.get("/calendar", response_model=list[CalendarDay])
def calendar(analytics: Analytics, gate: Gate = DEFAULT_GATE) -> list[dict]:
    return analytics.calendar(gate)


@router.get("/accuracy", response_model=Accuracy)
def accuracy(
    analytics: Analytics,
    basis: Basis = "decision",
    gate: Gate = DEFAULT_GATE,
    horizon_h: Horizon = 24,
    variant: Variant = "raw",
    start: Start = None,
    end: End = None,
) -> dict:
    return analytics.accuracy(basis, gate, horizon_h, variant, start, end)


@router.get("/lead-time-curve", response_model=list[LeadTimePoint])
def lead_time_curve(analytics: Analytics, start: Start = None, end: End = None) -> list[dict]:
    return analytics.lead_time_curve(start, end)


@router.get("/insights", response_model=list[Insight])
def insights(analytics: Analytics, gate: Gate = DEFAULT_GATE) -> list[dict]:
    return analytics.insights(gate)


@router.get("/export/decisions/{decision_date}.csv", response_class=PlainTextResponse)
def export_decision(analytics: Analytics, decision_date: date, gate: Gate = DEFAULT_GATE) -> PlainTextResponse:
    return _csv(analytics.export_decision_csv(decision_date, gate), f"winddesk-decision-{decision_date}-{gate}.csv")


@router.get("/export/accuracy.csv", response_class=PlainTextResponse)
def export_accuracy(
    analytics: Analytics,
    basis: Basis = "decision",
    gate: Gate = DEFAULT_GATE,
    horizon_h: Horizon = 24,
    variant: Variant = "raw",
    start: Start = None,
    end: End = None,
) -> PlainTextResponse:
    body = analytics.export_accuracy_csv(
        basis=basis, gate_id=gate, horizon_h=horizon_h, variant=variant, start=start, end=end
    )
    return _csv(body, f"winddesk-accuracy-{basis}-{variant}.csv")


def _csv(body: str, filename: str) -> PlainTextResponse:
    return PlainTextResponse(
        body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
