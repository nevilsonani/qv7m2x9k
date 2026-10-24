import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DecisionView } from "../../api/types";
import { axisProps, gridProps, niceMaxMw, timeTickLabel, timeTicks, toMs } from "../../lib/chart";
import { C } from "../../lib/colors";
import { fmtDayTime, fmtGW, fmtTime, tickGW } from "../../lib/format";
import { TooltipCard, type TooltipRow } from "./TooltipCard";

interface Row {
  x: number;
  known: number | null;
  later: number | null;
  forecast: number | null;
  calibrated: number | null;
  band: [number, number] | null;
}

export function DecisionChart({
  view,
  showCalibrated,
  reveal,
}: {
  view: DecisionView;
  showCalibrated: boolean;
  reveal: boolean;
}) {
  const gate = toMs(view.gate_closure);
  const start = toMs(view.view_start);
  const deliveryStart = toMs(view.delivery_start);
  const end = toMs(view.delivery_end);

  const rows = useMemo<Row[]>(() => {
    const out = view.series.map((p) => ({
      x: toMs(p.t),
      known: p.actual_known ? p.actual : null,
      later: p.actual_known ? null : p.actual,
      forecast: p.forecast,
      calibrated: p.calibrated,
      band: p.low !== null && p.high !== null ? ([p.low, p.high] as [number, number]) : null,
    }));
    // Join the "later" outturn line onto the last known point so it reads as one line.
    const lastKnown = out.findLastIndex((r) => r.known !== null);
    if (lastKnown >= 0) out[lastKnown] = { ...out[lastKnown], later: out[lastKnown].known };
    return out;
  }, [view.series]);

  const yMax = useMemo(() => {
    const values = view.series.flatMap((p) => [p.actual, p.forecast, showCalibrated ? p.high : null]);
    return niceMaxMw(Math.max(...values.filter((v): v is number => v !== null)));
  }, [view.series, showCalibrated]);

  const ticks = useMemo(() => timeTicks(start, end, 6), [start, end]);

  return (
    <div
      role="img"
      aria-label={`Wind generation forecast for delivery ${view.delivery_date}, as known at gate closure ${fmtTime(gate)}`}
    >
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={rows} margin={{ top: 28, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <ReferenceArea
            x1={deliveryStart}
            x2={end}
            fill={C.delivery}
            ifOverflow="hidden"
            label={{ value: "Delivery day", position: "insideTopRight", fill: C.ink3, fontSize: 11, offset: 8 }}
          />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={[start, end]}
            ticks={ticks}
            tickFormatter={timeTickLabel}
            {...axisProps}
          />
          <YAxis domain={[0, yMax]} tickFormatter={tickGW} width={44} tickCount={6} {...axisProps} />

          {showCalibrated && (
            <Area
              dataKey="band"
              stroke="none"
              fill={C.calibrated}
              fillOpacity={0.16}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          <Line
            dataKey="forecast"
            stroke={C.forecast}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
            strokeOpacity={showCalibrated ? 0.75 : 1}
          />
          {showCalibrated && (
            <Line dataKey="calibrated" stroke={C.calibrated} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          )}
          <Line dataKey="known" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
          {reveal && <Line dataKey="later" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={false} />}

          <ReferenceLine
            x={gate}
            stroke={C.ink2}
            strokeWidth={1}
            label={{ value: `Gate closure ${fmtTime(gate)}`, position: "top", fill: C.ink2, fontSize: 11 }}
          />

          <Tooltip
            cursor={{ stroke: C.axis, strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined;
              if (!active || !row) return null;
              const items: TooltipRow[] = [];
              const outturn = row.known ?? (reveal ? row.later : null);
              if (outturn !== null) items.push({ label: "Actual", value: fmtGW(outturn), color: C.actual });
              if (row.forecast !== null) items.push({ label: "Forecast (raw)", value: fmtGW(row.forecast), color: C.forecast });
              if (showCalibrated && row.calibrated !== null)
                items.push({ label: "Calibrated", value: fmtGW(row.calibrated), color: C.calibrated });
              if (showCalibrated && row.band)
                items.push({ label: "80% range", value: `${fmtGW(row.band[0], 1)} – ${fmtGW(row.band[1], 1)}` });
              if (items.length === 0) return null;
              const phase = row.x < gate ? "Known at gate closure" : row.x < deliveryStart ? "Before delivery" : "Delivery day";
              return <TooltipCard title={fmtDayTime(row.x)} rows={items} footer={phase} />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
