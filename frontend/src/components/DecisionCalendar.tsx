import { useRef, type KeyboardEvent } from "react";

import type { CalendarDay } from "../api/types";
import { cx } from "../lib/cx";
import { divergingFill, sequentialFill } from "../lib/colors";
import { dayOfMonth, fmtDate, fmtGWh, fmtSignedPct } from "../lib/format";

/**
 * One cell per auction day. Before the outcome is revealed the tint shows expected
 * wind energy (sequential); after, the forecast's energy error (diverging), so the
 * calendar never leaks hindsight into the "at gate closure" view.
 */
export function DecisionCalendar({
  days,
  selected,
  onSelect,
  reveal,
  calibrated,
}: {
  days: CalendarDay[];
  selected: string | undefined;
  onSelect: (decisionDate: string) => void;
  reveal: boolean;
  calibrated: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const energies = days.map((d) => (calibrated ? d.calibrated_gwh : d.forecast_gwh));
  const minE = Math.min(...energies);
  const maxE = Math.max(...energies);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.min(Math.max(index + step, 0), days.length - 1);
    onSelect(days[next].decision_date);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="listbox"
        aria-label="Auction day"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((day, i) => {
          const energy = calibrated ? day.calibrated_gwh : day.forecast_gwh;
          const error = calibrated ? day.calibrated_error_pct : day.forecast_error_pct;
          const active = day.decision_date === selected;
          const weekday = fmtDate(day.decision_date).slice(0, 1);
          const title = reveal
            ? `Auction ${fmtDate(day.decision_date)} → delivery ${fmtDate(day.delivery_date)}: forecast ${fmtGWh(energy)}, actual ${fmtGWh(day.actual_gwh)} (${fmtSignedPct(error)})`
            : `Auction ${fmtDate(day.decision_date)} → delivery ${fmtDate(day.delivery_date)}: expected ${fmtGWh(energy)}`;
          return (
            <button
              key={day.decision_date}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={title}
              onClick={() => onSelect(day.decision_date)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "group relative flex h-14 min-w-0 flex-col items-center justify-center rounded-md text-center transition-shadow",
                active ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-line-strong",
              )}
              style={{ background: reveal ? divergingFill(error, 40) : sequentialFill(energy, minE, maxE) }}
            >
              <span className="text-[10px] leading-none font-medium text-ink-2">{weekday}</span>
              <span className="num mt-1 text-[13px] leading-none font-semibold text-ink">{dayOfMonth(day.decision_date)}</span>
              <span className="num mt-1 hidden text-[10px] leading-none text-ink-2 xl:block">
                {reveal ? fmtSignedPct(error, 0) : energy.toFixed(0)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
        <span>Auction day, January 2026 · delivery is the following day · ← → to step</span>
        {reveal ? (
          <span className="flex items-center gap-2">
            <span>Daily energy error</span>
            <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${divergingFill(-40)}, ${divergingFill(0)}, ${divergingFill(40)})` }} aria-hidden />
            <span>under · over-forecast</span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span>Expected wind energy</span>
            <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${sequentialFill(0, 0, 1)}, ${sequentialFill(1, 0, 1)})` }} aria-hidden />
            <span>
              {minE.toFixed(0)} – {maxE.toFixed(0)} GWh
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
