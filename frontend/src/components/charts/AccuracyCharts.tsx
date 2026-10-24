import { useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Accuracy, DailyAccuracy, HistogramBin, HourProfile, LeadTimeCurve, LevelProfile } from "../../api/types";
import { axisProps, gridProps, gwScale, toMs } from "../../lib/chart";
import { C, divergingFill } from "../../lib/colors";
import { dayOfMonth, fmtDate, fmtDayMonth, fmtDayTime, fmtGW, fmtGWh, fmtHours, fmtSignedGW, fmtSignedPct, tickGW } from "../../lib/format";
import { TooltipCard } from "./TooltipCard";

const tickSignedGW = (mw: number) => (mw === 0 ? "0" : `${mw > 0 ? "+" : "−"}${Math.abs(mw / 1000).toFixed(0)}`);

// ------------------------------------------------------------ time series

export function AccuracySeriesChart({ data }: { data: Accuracy }) {
  const calibrated = data.variant === "calibrated";
  const rows = useMemo(
    () =>
      data.series.map((p) => ({
        x: toMs(p.t),
        forecast: p.forecast,
        actual: p.actual,
        band: p.low !== null && p.high !== null ? [p.low, p.high] : null,
      })),
    [data.series],
  );
  const y = gwScale(Math.max(...data.series.flatMap((p) => [p.forecast ?? 0, p.actual ?? 0, p.high ?? 0])));
  const forecastLabel = calibrated ? "Calibrated forecast" : "Forecast";
  const forecastColor = calibrated ? C.calibrated : C.forecast;

  return (
    <div role="img" aria-label={`${forecastLabel} versus actual wind generation over the selected period`}>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ms: number) => fmtDayMonth(ms)}
            minTickGap={40}
            {...axisProps}
          />
          <YAxis domain={[0, y.max]} ticks={y.ticks} tickFormatter={tickGW} width={44} {...axisProps} />
          {calibrated && (
            <Area dataKey="band" stroke="none" fill={C.calibrated} fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
          )}
          <Line dataKey="actual" stroke={C.actual} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="forecast" stroke={forecastColor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Tooltip
            cursor={{ stroke: C.axis }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              const error = row.forecast !== null && row.actual !== null ? row.forecast - row.actual : null;
              return (
                <TooltipCard
                  title={fmtDayTime(row.x)}
                  rows={[
                    { label: forecastLabel, value: fmtGW(row.forecast), color: forecastColor },
                    { label: "Actual", value: fmtGW(row.actual), color: C.actual },
                    { label: "Error", value: fmtSignedGW(error) },
                  ]}
                />
              );
            }}
          />
          <Brush
            dataKey="x"
            height={26}
            stroke={C.axis}
            fill={C.surface}
            travellerWidth={8}
            tickFormatter={(ms: number) => fmtDayMonth(ms)}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ lead time

export function LeadTimeChart({ curve }: { curve: LeadTimeCurve }) {
  const rows = curve.points.filter((p) => p.mae !== null);
  const ref = curve.day_ahead;
  const y = gwScale(Math.max(...rows.map((p) => p.p90_abs ?? 0)));

  return (
    <div role="img" aria-label="Forecast error by lead time">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid {...gridProps} />
          {ref.lead_min_h !== null && ref.lead_max_h !== null && (
            <ReferenceArea
              x1={ref.lead_min_h}
              x2={ref.lead_max_h}
              fill={C.delivery}
              label={{ value: "Day-ahead decisions", position: "insideTop", fill: C.ink3, fontSize: 11 }}
            />
          )}
          <XAxis
            dataKey="horizon_h"
            type="number"
            domain={[0, 48]}
            ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
            tickFormatter={(h: number) => `${h}h`}
            {...axisProps}
          />
          <YAxis domain={[0, y.max]} ticks={y.ticks} tickFormatter={tickGW} width={44} {...axisProps} />
          <Line dataKey="p90_abs" stroke={C.ink3} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="mae" stroke={C.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
          {ref.lead_mean_h !== null && ref.raw_mae !== null && (
            <ReferenceDot
              x={ref.lead_mean_h}
              y={ref.raw_mae}
              r={6}
              fill={C.forecast}
              stroke={C.surface}
              strokeWidth={2}
              label={{ value: `Raw ${fmtGW(ref.raw_mae)}`, position: "top", fill: C.ink2, fontSize: 11 }}
            />
          )}
          {ref.lead_mean_h !== null && ref.calibrated_mae !== null && (
            <ReferenceDot
              x={ref.lead_mean_h}
              y={ref.calibrated_mae}
              r={6}
              fill={C.calibrated}
              stroke={C.surface}
              strokeWidth={2}
              label={{ value: `Calibrated ${fmtGW(ref.calibrated_mae)}`, position: "bottom", fill: C.ink2, fontSize: 11 }}
            />
          )}
          <Tooltip
            cursor={{ stroke: C.axis }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={`Published ≥ ${fmtHours(row.horizon_h)} ahead`}
                  rows={[
                    { label: "MAE", value: fmtGW(row.mae), color: C.forecast },
                    { label: "P90 |error|", value: fmtGW(row.p90_abs), color: C.ink3 },
                    { label: "Bias", value: fmtSignedGW(row.bias) },
                  ]}
                  footer={row.coverage_pct < 100 ? `${row.coverage_pct}% of hours have a forecast this far ahead` : undefined}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ distribution

function binFill(bin: HistogramBin) {
  if (bin.x1 <= 0) return C.under;
  if (bin.x0 >= 0) return C.over;
  return C.mid;
}

export function ErrorHistogram({ bins, p10, p50, p90 }: { bins: HistogramBin[]; p10: number; p50: number; p90: number }) {
  const rows = bins.map((b) => ({ ...b, mid: (b.x0 + b.x1) / 2 }));
  const lo = rows[0]?.x0 ?? -1000;
  const hi = rows[rows.length - 1]?.x1 ?? 1000;
  const marker = (x: number, label: string, position: "insideTopLeft" | "insideTopRight" | "top") => (
    <ReferenceLine x={x} stroke={C.ink2} strokeWidth={1} label={{ value: label, position, fill: C.ink2, fontSize: 11 }} />
  );

  return (
    <div role="img" aria-label="Distribution of forecast errors">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 20, right: 16, bottom: 4, left: -8 }} barCategoryGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mid" type="number" domain={[lo, hi]} tickFormatter={tickSignedGW} tickCount={9} {...axisProps} />
          <YAxis width={44} allowDecimals={false} {...axisProps} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {rows.map((b) => (
              <Cell key={b.x0} fill={binFill(b)} />
            ))}
          </Bar>
          {marker(p10, "P10", "insideTopRight")}
          {marker(p50, "P50", "top")}
          {marker(p90, "P90", "insideTopLeft")}
          <Tooltip
            cursor={{ fill: C.grid, fillOpacity: 0.5 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={`${fmtSignedGW(row.x0, 1)} to ${fmtSignedGW(row.x1, 1)}`}
                  rows={[{ label: "Hours", value: String(row.count), color: binFill(row) }]}
                  footer={row.x0 >= 0 ? "Over-forecast: wind fell short" : row.x1 <= 0 ? "Under-forecast: more wind than planned" : undefined}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ hour of day

export function HourProfileChart({ rows }: { rows: HourProfile[] }) {
  const data = rows.map((r) => ({ ...r, band: [r.p10, r.p90] }));
  const lo = Math.min(0, ...rows.map((r) => r.p10));
  const hi = Math.max(0, ...rows.map((r) => r.p90));
  const step = 1000;
  const yLo = Math.floor(lo / step) * step;
  const yHi = Math.ceil(hi / step) * step;
  const yTicks = Array.from({ length: (yHi - yLo) / step + 1 }, (_, i) => yLo + i * step);

  return (
    <div role="img" aria-label="Forecast error by hour of day">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 23]}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
            tickFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`}
            {...axisProps}
          />
          <YAxis
            domain={[yLo, yHi]}
            ticks={yTicks}
            tickFormatter={tickSignedGW}
            width={44}
            {...axisProps}
          />
          <ReferenceLine y={0} stroke={C.axis} />
          <Area dataKey="band" stroke="none" fill={C.forecast} fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
          <Line dataKey="bias" stroke={C.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip
            cursor={{ stroke: C.axis }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={`${String(row.hour).padStart(2, "0")}:00 UK`}
                  rows={[
                    { label: "Mean error", value: fmtSignedGW(row.bias), color: C.forecast },
                    { label: "P10 – P90", value: `${fmtSignedGW(row.p10, 1)} – ${fmtSignedGW(row.p90, 1)}` },
                    { label: "MAE", value: fmtGW(row.mae) },
                  ]}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ wind level

const levelLabel = (l: LevelProfile) =>
  l.hi === null ? `${(l.lo / 1000).toFixed(0)}+ GW` : `${(l.lo / 1000).toFixed(0)}–${(l.hi / 1000).toFixed(0)} GW`;

export function LevelChart({ rows }: { rows: LevelProfile[] }) {
  const data = rows.map((r) => ({ ...r, label: levelLabel(r), pct: r.ratio * 100 }));
  return (
    <div role="img" aria-label="Share of forecast wind that was delivered, by forecast level">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 24, right: 16, bottom: 4, left: -8 }} barCategoryGap="28%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis domain={[0, 110]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} width={52} {...axisProps} />
          <ReferenceLine y={100} stroke={C.ink3} />
          <Bar dataKey="pct" fill={C.forecast} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="pct"
              position="top"
              formatter={(v) => `${Math.round(Number(v))}%`}
              style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
          <Tooltip
            cursor={{ fill: C.grid, fillOpacity: 0.5 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={`Forecast ${row.label}`}
                  rows={[
                    { label: "Delivered", value: `${row.pct.toFixed(1)}% of forecast`, color: C.forecast },
                    { label: "Mean error", value: fmtSignedGW(row.bias) },
                    { label: "Hours", value: String(row.n) },
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ daily energy

export function DailyErrorChart({ rows }: { rows: DailyAccuracy[] }) {
  const values = rows.map((r) => r.error_pct ?? 0);
  const bound = Math.max(20, Math.ceil(Math.max(...values.map(Math.abs)) / 20) * 20);
  return (
    <div role="img" aria-label="Daily wind energy forecast error by delivery day">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -8 }} barCategoryGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="delivery_date" tickFormatter={(d: string) => String(dayOfMonth(d))} interval={0} {...axisProps} />
          <YAxis domain={[-bound, bound]} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`} width={48} {...axisProps} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Bar dataKey="error_pct" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.delivery_date} fill={divergingFill(r.error_pct, 30)} />
            ))}
          </Bar>
          <Tooltip
            cursor={{ fill: C.grid, fillOpacity: 0.5 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as DailyAccuracy | undefined;
              if (!active || !row) return null;
              return (
                <TooltipCard
                  title={`Delivery ${fmtDate(row.delivery_date)}`}
                  rows={[
                    { label: "Forecast", value: fmtGWh(row.forecast_gwh) },
                    { label: "Actual", value: fmtGWh(row.actual_gwh) },
                    { label: "Error", value: `${fmtSignedPct(row.error_pct)} (${fmtGWh(row.error_gwh)})`, color: divergingFill(row.error_pct, 30) },
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
