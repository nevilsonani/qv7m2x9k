"""Refresh the committed data snapshot from Elexon.

Usage (from ``backend/``):  python -m app.data.ingest [--out DIR]
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from app.config import get_settings
from app.data.store import fetch_raw, save_snapshot


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Refresh the committed data snapshot from Elexon.")
    parser.add_argument("--out", type=Path, default=settings.snapshot_dir, help="snapshot directory")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    raw = fetch_raw(settings)
    save_snapshot(raw, args.out, settings)
    print(
        f"Wrote {len(raw.forecasts):,} forecast rows "
        f"({raw.forecasts['publish_time'].nunique()} runs) and "
        f"{len(raw.actuals):,} actual rows to {args.out}"
    )


if __name__ == "__main__":
    main()
