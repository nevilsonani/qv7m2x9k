"""GB day-ahead market conventions.

The GB day-ahead auctions run on the day before delivery (D-1) and cover a delivery
day that starts at 23:00 UK time on D-1 and ends at 23:00 UK time on D. All
conventions are expressed in UK local time and converted to UTC, so they remain
correct across BST changes.

Sources:
- Nord Pool N2EX GB day-ahead: gate closure 09:50 UK time.
- EPEX SPOT GB day-ahead (hourly) auction: gate closure 09:20 UK time.
- Nord Pool GB day-ahead market regulations: the delivery day starts at 23:00 UK time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

UK_TZ = ZoneInfo("Europe/London")
DELIVERY_DAY_START = time(23, 0)


@dataclass(frozen=True)
class GateClosure:
    id: str
    label: str
    local_time: time
    description: str


GATE_CLOSURES: dict[str, GateClosure] = {
    "n2ex": GateClosure(
        id="n2ex",
        label="N2EX 09:50",
        local_time=time(9, 50),
        description="Nord Pool N2EX GB day-ahead auction",
    ),
    "epex": GateClosure(
        id="epex",
        label="EPEX 09:20",
        local_time=time(9, 20),
        description="EPEX SPOT GB day-ahead hourly auction",
    ),
}
DEFAULT_GATE = "n2ex"


def get_gate(gate_id: str) -> GateClosure:
    try:
        return GATE_CLOSURES[gate_id]
    except KeyError as exc:
        raise ValueError(f"Unknown gate closure '{gate_id}'") from exc


def _local(d: date, t: time) -> datetime:
    return datetime.combine(d, t, tzinfo=UK_TZ).astimezone(UTC)


def gate_closure_utc(decision_date: date, gate: GateClosure) -> datetime:
    """The moment the purchase decision for ``decision_date + 1`` must be made."""
    return _local(decision_date, gate.local_time)


def delivery_window_utc(delivery_date: date) -> tuple[datetime, datetime]:
    """UTC ``[start, end)`` of a delivery day: 23:00 UK on D-1 to 23:00 UK on D."""
    return (
        _local(delivery_date - timedelta(days=1), DELIVERY_DAY_START),
        _local(delivery_date, DELIVERY_DAY_START),
    )


def delivery_dates(times_utc: pd.Series) -> pd.Series:
    """Delivery date of each UTC timestamp (a 23:00 UK start rolls into the next day)."""
    wall_clock = times_utc.dt.tz_convert(UK_TZ).dt.tz_localize(None)
    return (wall_clock + pd.Timedelta(hours=24 - DELIVERY_DAY_START.hour)).dt.date


def decision_cutoffs(times_utc: pd.Series, gate: GateClosure) -> pd.Series:
    """For each target time, the gate closure of the auction that buys it."""
    days = delivery_dates(times_utc)
    lookup = {d: gate_closure_utc(d - timedelta(days=1), gate) for d in set(days)}
    return pd.to_datetime(days.map(lookup), utc=True).astype("datetime64[ns, UTC]")
