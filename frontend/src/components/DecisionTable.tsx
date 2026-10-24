import type { DecisionView } from "../api/types";
import { toMs } from "../lib/chart";
import { fmtDayTime, fmtMW } from "../lib/format";

/** Hourly table twin of the decision chart (the accessible, exact-value view). */
export function DecisionTable({ view, reveal }: { view: DecisionView; reveal: boolean }) {
  const start = toMs(view.delivery_start);
  const end = toMs(view.delivery_end);
  const rows = view.series.filter((p) => toMs(p.t) >= start && toMs(p.t) < end && p.forecast !== null);
  const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtMW(Math.abs(v))}`);

  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
      <table className="num w-full text-right text-[12px]">
        <thead className="sticky top-0 bg-surface-2 text-ink-3">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Hour (UK)</th>
            <th scope="col" className="px-3 py-2 font-medium">Raw forecast</th>
            <th scope="col" className="px-3 py-2 font-medium">Calibrated</th>
            <th scope="col" className="px-3 py-2 font-medium">80% range</th>
            {reveal && (
              <>
                <th scope="col" className="px-3 py-2 font-medium">Actual</th>
                <th scope="col" className="px-3 py-2 font-medium">Raw error</th>
                <th scope="col" className="px-3 py-2 font-medium">Calibrated error</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="text-ink-2">
          {rows.map((p) => (
            <tr key={p.t} className="border-t border-line">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink">{fmtDayTime(p.t)}</th>
              <td className="px-3 py-1.5">{fmtMW(p.forecast)}</td>
              <td className="px-3 py-1.5">{fmtMW(p.calibrated)}</td>
              <td className="px-3 py-1.5">
                {p.low !== null && p.high !== null ? `${fmtMW(p.low)} – ${fmtMW(p.high)}` : "—"}
              </td>
              {reveal && (
                <>
                  <td className="px-3 py-1.5 text-ink">{fmtMW(p.actual)}</td>
                  <td className="px-3 py-1.5">{signed(p.forecast !== null && p.actual !== null ? p.forecast - p.actual : null)}</td>
                  <td className="px-3 py-1.5">
                    {signed(p.calibrated !== null && p.actual !== null ? p.calibrated - p.actual : null)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
