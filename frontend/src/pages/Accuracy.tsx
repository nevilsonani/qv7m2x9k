import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { apiUrl } from "../api/client";
import { accuracyQueryParams, useAccuracy, useInsights, useLeadTimeCurve, useMeta } from "../api/queries";
import type { Accuracy, Basis, Variant } from "../api/types";
import {
  AccuracySeriesChart,
  DailyErrorChart,
  ErrorHistogram,
  HourProfileChart,
  LeadTimeChart,
  LevelChart,
} from "../components/charts/AccuracyCharts";
import { InsightCards } from "../components/InsightCards";
import { Button, Card, ErrorState, Legend, LinkButton, PageHeader, Segmented, Skeleton, Stat } from "../components/ui";
import { C } from "../lib/colors";
import { fmtDate, fmtGW, fmtGWh, fmtHours, fmtShare, fmtSignedGW, fmtSignedPct } from "../lib/format";
import { useGate, useUrlParam } from "../lib/urlState";

const BASIS_OPTIONS = [
  { value: "decision" as const, label: "Day-ahead decision", title: "The forecast in hand at each auction's gate closure" },
  { value: "horizon" as const, label: "Fixed lead time", title: "The latest forecast published at least N hours before each hour" },
];

export default function AccuracyPage() {
  const meta = useMeta();
  const [gate] = useGate();
  const [basisRaw, setBasis] = useUrlParam("basis", "decision");
  const [variantRaw, setVariant] = useUrlParam("variant", "calibrated");
  const [horizonRaw, setHorizon] = useUrlParam("h", "24");
  const [start, setStart] = useUrlParam("start", "");
  const [end, setEnd] = useUrlParam("end", "");

  const basis: Basis = basisRaw === "horizon" ? "horizon" : "decision";
  const variant: Variant = basis === "horizon" ? "raw" : variantRaw === "raw" ? "raw" : "calibrated";
  const horizonH = Math.min(48, Math.max(0, Number(horizonRaw) || 0));

  // The slider moves locally and commits after a short pause, so dragging stays smooth.
  const [horizonDraft, setHorizonDraft] = useState(horizonH);
  const [committedH, setCommittedH] = useState(horizonH);
  if (committedH !== horizonH) {
    // The URL changed (back button, shared link): follow it.
    setCommittedH(horizonH);
    setHorizonDraft(horizonH);
  }
  useEffect(() => {
    if (horizonDraft === horizonH) return;
    const timer = window.setTimeout(() => setHorizon(String(horizonDraft)), 150);
    return () => window.clearTimeout(timer);
  }, [horizonDraft, horizonH, setHorizon]);

  const params = { basis, gate, horizonH, variant, start: start || undefined, end: end || undefined };
  const accuracy = useAccuracy(params);
  const curve = useLeadTimeCurve(gate, params.start, params.end);
  const insights = useInsights(gate);
  const data = accuracy.data;

  const firstDelivery = meta.data ? addDay(meta.data.decision_dates[0]) : undefined;
  const lastDelivery = meta.data ? addDay(meta.data.decision_dates[meta.data.decision_dates.length - 1]) : undefined;

  return (
    <>
      <PageHeader
        title="Forecast accuracy"
        description="How far to trust the wind forecast when you buy: error size, direction and spread across January 2026, by lead time, hour of day and wind level. Every figure is computed from the Elexon data, nothing is hand-entered."
      />

      <section aria-labelledby="findings" className="mb-6">
        <h2 id="findings" className="mb-3 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
          Pilot findings · whole of January
        </h2>
        {insights.isError ? <ErrorState error={insights.error} /> : <InsightCards insights={insights.data} loading={insights.isPending} />}
      </section>

      {/* One filter row scopes every chart below it. */}
      <div className="sticky top-[57px] z-20 -mx-1 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface/95 px-4 py-3 backdrop-blur-md">
        <Segmented<Basis> label="Forecast basis" value={basis} onChange={setBasis} options={BASIS_OPTIONS} />
        {basis === "horizon" ? (
          <label className="flex items-center gap-3 text-[13px] text-ink-2">
            Lead time
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={horizonDraft}
              onChange={(e) => setHorizonDraft(Number(e.target.value))}
              className="w-40 accent-[var(--c-forecast)]"
              aria-valuetext={`${horizonDraft} hours`}
            />
            <span className="num w-12 font-semibold text-ink">{horizonDraft} h</span>
          </label>
        ) : (
          <Segmented<Variant>
            label="Forecast variant"
            value={variant}
            onChange={setVariant}
            options={[
              { value: "raw", label: "Raw forecast" },
              { value: "calibrated", label: "Calibrated" },
            ]}
          />
        )}
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <span>Delivery</span>
          <input
            type="date"
            value={start || firstDelivery || ""}
            min={firstDelivery}
            max={end || lastDelivery}
            onChange={(e) => setStart(e.target.value === firstDelivery ? null : e.target.value)}
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-ink"
            aria-label="First delivery date"
          />
          <span>to</span>
          <input
            type="date"
            value={end || lastDelivery || ""}
            min={start || firstDelivery}
            max={lastDelivery}
            onChange={(e) => setEnd(e.target.value === lastDelivery ? null : e.target.value)}
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-ink"
            aria-label="Last delivery date"
          />
          {(start || end) && (
            <Button
              onClick={() => {
                setStart(null);
                setEnd(null);
              }}
            >
              All of January
            </Button>
          )}
        </div>
        <div className="ml-auto">
          <LinkButton href={apiUrl("/api/export/accuracy.csv", accuracyQueryParams(params))} icon={<Download className="h-3.5 w-3.5" aria-hidden />}>
            Export CSV
          </LinkButton>
        </div>
      </div>

      {accuracy.isError ? (
        <ErrorState error={accuracy.error} onRetry={() => accuracy.refetch()} />
      ) : !data ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className={accuracy.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <KpiRow data={data} />

          <Card
            className="mt-4"
            title={`${variant === "calibrated" ? "Calibrated forecast" : "Forecast"} vs actual, GW`}
            subtitle={`${describeBasis(data)} · drag the handles below the chart to zoom`}
            actions={
              <Legend
                items={[
                  { label: variant === "calibrated" ? "Calibrated forecast" : "Forecast", color: variant === "calibrated" ? C.calibrated : C.forecast },
                  { label: "Actual", color: C.actual },
                  ...(variant === "calibrated" ? [{ label: "80% range", color: C.calibrated, kind: "area" as const }] : []),
                ]}
              />
            }
          >
            <AccuracySeriesChart data={data} />
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card
              title="Error grows with lead time"
              subtitle="Raw forecast MAE by how far ahead it was published; dots mark the day-ahead decision"
              actions={
                <Legend
                  items={[
                    { label: "MAE", color: C.forecast },
                    { label: "P90 |error|", color: C.ink3 },
                    { label: "Calibrated day-ahead", color: C.calibrated, kind: "dot" },
                  ]}
                />
              }
              busy={curve.isPlaceholderData}
            >
              {curve.data ? <LeadTimeChart curve={curve.data} /> : <Skeleton className="h-[280px]" />}
            </Card>

            {data.stats && (
              <Card
                title="Error distribution"
                subtitle={`Forecast − actual, per hour · P10 ${fmtSignedGW(data.stats.p10, 1)} · median ${fmtSignedGW(data.stats.p50, 1)} · P90 ${fmtSignedGW(data.stats.p90, 1)}`}
                actions={
                  <Legend
                    items={[
                      { label: "Under-forecast", color: C.under, kind: "bar" },
                      { label: "Over-forecast (shortfall)", color: C.over, kind: "bar" },
                    ]}
                  />
                }
              >
                <ErrorHistogram bins={data.histogram} p10={data.stats.p10} p50={data.stats.p50} p90={data.stats.p90} />
              </Card>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card
              title="Error by hour of day"
              subtitle="Mean error with the P10–P90 spread, UK time"
              actions={
                <Legend
                  items={[
                    { label: "Mean error", color: C.forecast },
                    { label: "P10–P90", color: C.forecast, kind: "area" },
                  ]}
                />
              }
            >
              <HourProfileChart rows={data.by_hour} />
            </Card>
            <Card title="Share of forecast wind delivered" subtitle="Actual ÷ forecast energy, by forecast level. 100% = forecast was right on average">
              <LevelChart rows={data.by_level} />
            </Card>
          </div>

          <DailyCard data={data} />
        </div>
      )}
    </>
  );
}

function KpiRow({ data }: { data: Accuracy }) {
  const s = data.stats;
  if (!s) return <p className="text-ink-3">No forecast/actual pairs in this selection.</p>;
  return (
    <Card>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Mean absolute error" value={fmtGW(s.mae)} sub={`${s.nmae_pct.toFixed(1)}% of mean output`} />
        <Stat label="Bias (mean error)" value={fmtSignedGW(s.bias)} tone={s.bias_pct > 5 ? "risk" : "default"} sub={`${fmtSignedPct(s.bias_pct)} vs actual`} />
        <Stat label="RMSE" value={fmtGW(s.rmse)} sub="Penalises large misses" />
        <Stat label="P90 absolute error" value={fmtGW(s.p90_abs)} sub="9 hours in 10 miss by less" />
        <Stat label="Over-forecast hours" value={fmtShare(s.over_forecast_share)} sub="Wind fell short of forecast" />
        <Stat label="Daily energy error" value={fmtGWh(data.daily_energy_mae_gwh)} sub={`Bias ${data.daily_energy_bias_gwh !== null && data.daily_energy_bias_gwh > 0 ? "+" : ""}${fmtGWh(data.daily_energy_bias_gwh)}/day`} />
        <Stat label="Correlation" value={s.corr?.toFixed(3) ?? "—"} sub="Shape of the forecast" />
        {data.band_coverage_pct !== null ? (
          <Stat
            label="80% range coverage"
            value={`${data.band_coverage_pct.toFixed(1)}%`}
            tone={Math.abs(data.band_coverage_pct - 80) <= 5 ? "good" : "default"}
            sub="Hours inside the range (target 80%)"
          />
        ) : (
          <Stat label="Lead time" value={`${fmtHours(data.lead_min_h)}–${fmtHours(data.lead_max_h)}`} sub="Range of forecasts used" />
        )}
      </div>
    </Card>
  );
}

function DailyCard({ data }: { data: Accuracy }) {
  const [table, setTable] = useState(false);
  return (
    <Card
      className="mt-4"
      title="Daily wind energy error"
      subtitle="Forecast vs actual energy per delivery day (23:00–23:00 UK)"
      actions={
        <>
          <Legend
            items={[
              { label: "Under-forecast", color: C.under, kind: "bar" },
              { label: "Over-forecast", color: C.over, kind: "bar" },
            ]}
          />
          <Button onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</Button>
        </>
      }
    >
      {table ? (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
          <table className="num w-full text-right text-[12px]">
            <thead className="sticky top-0 bg-surface-2 text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Delivery day</th>
                <th scope="col" className="px-3 py-2 font-medium">Forecast</th>
                <th scope="col" className="px-3 py-2 font-medium">Actual</th>
                <th scope="col" className="px-3 py-2 font-medium">Error</th>
                <th scope="col" className="px-3 py-2 font-medium">Error %</th>
                <th scope="col" className="px-3 py-2 font-medium">Hourly MAE</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {data.daily.map((d) => (
                <tr key={d.delivery_date} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink">{fmtDate(d.delivery_date)}</th>
                  <td className="px-3 py-1.5">{fmtGWh(d.forecast_gwh)}</td>
                  <td className="px-3 py-1.5">{fmtGWh(d.actual_gwh)}</td>
                  <td className="px-3 py-1.5">{d.error_gwh !== null && d.error_gwh > 0 ? "+" : ""}{fmtGWh(d.error_gwh)}</td>
                  <td className="px-3 py-1.5">{fmtSignedPct(d.error_pct)}</td>
                  <td className="px-3 py-1.5">{fmtGW(d.mae)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DailyErrorChart rows={data.daily} />
      )}
    </Card>
  );
}

function describeBasis(data: Accuracy) {
  if (data.basis === "horizon") return `Latest forecast published at least ${data.horizon_h} h before each hour`;
  return `Forecast in hand at ${data.gate === "epex" ? "EPEX 09:20" : "N2EX 09:50"} gate closure · ${fmtHours(data.lead_min_h)}–${fmtHours(data.lead_max_h)} ahead`;
}

function addDay(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
