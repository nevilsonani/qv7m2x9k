import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DecisionView, Vintage } from "../../api/types";
import { axisProps, gridProps, gwScale, timeTickLabel, timeTicks, toMs } from "../../lib/chart";
import { C } from "../../lib/colors";
import { fmtDayTime, fmtGW, fmtGWh, fmtTime, tickGW } from "../../lib/format";
import { TooltipCard } from "./TooltipCard";

const PHASE_STYLE: Record<Vintage["phase"], { stroke: string; width: number; opacity: number }> = {
  before: { stroke: C.ink3, width: 1, opacity: 0.45 },
  decision: { stroke: C.forecast, width: 2.5, opacity: 1 },
  after: { stroke: C.later, width: 1.5, opacity: 0.9 },
};

/** Every forecast run for the delivery day, older runs receding, the decision run highlighted. */
export function VintageChart({ view, reveal }: { view: DecisionView; reveal: boolean }) {
  const start = toMs(view.delivery_start);
  const end = toMs(view.delivery_end);

  const { rows, keys } = useMemo(() => {
    const byX = new Map<number, Record<string, number | null>>();
    const row = (x: number) => {
      let r = byX.get(x);
      if (!r) byX.set(x, (r = { x }));
      return r;
    };
    const keys = view.vintages.map((v, i) => ({ key: `v${i}`, vintage: v }));
    for (const { key, vintage } of keys) for (const p of vintage.points) row(toMs(p.t))[key] = p.mw;
    for (const p of view.series) {
      const x = toMs(p.t);
      if (x >= start && x < end) row(x).actual = p.actual;
    }
    return { rows: [...byX.values()].sort((a, b) => (a.x as number) - (b.x as number)), keys };
  }, [view.vintages, view.series, start, end]);

  const y = useMemo(
    () =>
      gwScale(
        Math.max(...view.vintages.flatMap((v) => v.points.map((p) => p.mw)), ...view.series.map((p) => p.actual ?? 0)),
      ),
    [view.vintages, view.series],
  );
  const decisionKey = keys.find((k) => k.vintage.phase === "decision")?.key;
  const lastKey = keys.at(-1)?.key;

  return (
    <div role="img" aria-label="How successive forecast runs for this delivery day evolved">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={[start, end]}
            ticks={timeTicks(start, end, 6)}
            tickFormatter={timeTickLabel}
            {...axisProps}
          />
          <YAxis domain={[0, y.max]} ticks={y.ticks} tickFormatter={tickGW} width={44} {...axisProps} />
          {keys
            .filter((k) => k.vintage.phase !== "decision")
            .map(({ key, vintage }) => (
              <Line
                key={key}
                dataKey={key}
                stroke={PHASE_STYLE[vintage.phase].stroke}
                strokeWidth={PHASE_STYLE[vintage.phase].width}
                strokeOpacity={PHASE_STYLE[vintage.phase].opacity}
                dot={false}
                connectNulls
                isAnimationActive={false}
                activeDot={false}
              />
            ))}
          {decisionKey && (
            <Line dataKey={decisionKey} stroke={C.forecast} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          )}
          {reveal && <Line dataKey="actual" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={false} />}
          <Tooltip
            cursor={{ stroke: C.axis }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Record<string, number | null> | undefined;
              if (!active || !row || !decisionKey) return null;
              const items = [
                { label: "Decision run", value: fmtGW(row[decisionKey]), color: C.forecast },
                ...(lastKey && lastKey !== decisionKey
                  ? [{ label: "Latest run", value: fmtGW(row[lastKey]), color: C.later }]
                  : []),
                ...(reveal ? [{ label: "Actual", value: fmtGW(row.actual), color: C.actual }] : []),
              ];
              return <TooltipCard title={fmtDayTime(row.x as number)} rows={items} />;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const PHASE_DOT: Record<Vintage["phase"], string> = { before: C.ink3, decision: C.forecast, after: C.later };

/** The day's total wind energy as seen by each run: how the view converged. */
export function RunEnergyChart({ view, reveal }: { view: DecisionView; reveal: boolean }) {
  const rows = useMemo(
    () =>
      view.vintages
        .filter((v) => v.energy_gwh !== null)
        .map((v) => ({ x: toMs(v.publish_time), gwh: v.energy_gwh as number, phase: v.phase })),
    [view.vintages],
  );
  if (rows.length === 0) return <p className="text-[13px] text-ink-3">No run covers the full delivery day.</p>;

  const gate = toMs(view.gate_closure);
  const actual = view.energy.actual_gwh;
  const values = [...rows.map((r) => r.gwh), ...(reveal && actual !== null ? [actual] : [])];
  const span = Math.max(...values) - Math.min(...values);
  const step = span > 120 ? 50 : span > 50 ? 25 : 10;
  const lo = Math.max(0, Math.floor((Math.min(...values) - step / 2) / step) * step);
  const hi = Math.ceil((Math.max(...values) + step / 2) / step) * step;
  const yTicks = Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);

  return (
    <div role="img" aria-label="Forecast daily wind energy by forecast run">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={[rows[0].x - 3_600_000, rows[rows.length - 1].x + 3_600_000]}
            tickFormatter={(ms: number) => fmtTime(ms)}
            minTickGap={24}
            {...axisProps}
          />
          <YAxis domain={[lo, hi]} ticks={yTicks} width={44} {...axisProps} />
          <ReferenceLine x={gate} stroke={C.ink2} label={{ value: "Gate", position: "insideTopLeft", fill: C.ink2, fontSize: 11 }} />
          {reveal && actual !== null && (
            <ReferenceLine
              y={actual}
              stroke={C.actual}
              strokeWidth={2}
              label={{ value: `Actual ${actual.toFixed(0)}`, position: "insideBottomRight", fill: C.ink2, fontSize: 11 }}
            />
          )}
          <Line
            dataKey="gwh"
            stroke={C.axis}
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: { phase: Vintage["phase"]; x: number } }) => (
              <circle
                key={props.payload?.x}
                cx={props.cx}
                cy={props.cy}
                r={props.payload?.phase === "decision" ? 6 : 4.5}
                fill={PHASE_DOT[props.payload?.phase ?? "before"]}
                stroke={C.surface}
                strokeWidth={2}
              />
            )}
            activeDot={{ r: 6, stroke: C.surface, strokeWidth: 2 }}
          />
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              const label = row.phase === "decision" ? "Decision run" : row.phase === "after" ? "After gate" : "Before gate";
              return (
                <TooltipCard
                  title={`Run published ${fmtDayTime(row.x)}`}
                  rows={[{ label, value: fmtGWh(row.gwh), color: PHASE_DOT[row.phase] }]}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
