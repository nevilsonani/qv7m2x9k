import { ChevronLeft, ChevronRight, Download, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { apiUrl } from "../api/client";
import { useCalendar, useDecision, useMeta } from "../api/queries";
import type { DecisionView } from "../api/types";
import { DecisionChart } from "../components/charts/DecisionChart";
import { RunEnergyChart, VintageChart } from "../components/charts/EvolutionCharts";
import { DecisionCalendar } from "../components/DecisionCalendar";
import { DecisionTable } from "../components/DecisionTable";
import { Button, Card, ErrorState, Legend, LinkButton, PageHeader, Skeleton, Stat, Switch } from "../components/ui";
import { toMs } from "../lib/chart";
import { C } from "../lib/colors";
import { fmtDate, fmtDayTime, fmtGW, fmtGWh, fmtHours, fmtLongDate, fmtSignedPct, fmtTime } from "../lib/format";
import { useFlag, useGate, useUrlParam } from "../lib/urlState";

export default function DecisionDesk() {
  const meta = useMeta();
  const [gate] = useGate();
  const latest = meta.data?.decision_dates.at(-1) ?? "";
  const [date, setDate] = useUrlParam("date", latest);
  const [calibrated, setCalibrated] = useFlag("cal", true);
  const [reveal, setReveal] = useFlag("reveal", false);
  const [showTable, setShowTable] = useState(false);

  const decision = useDecision(date || undefined, gate);
  const calendar = useCalendar(gate);
  const view = decision.data;

  return (
    <>
      <PageHeader
        title="Decision desk"
        description={
          <>
            Replay any January auction exactly as your desk saw it at gate closure: the wind forecast in hand, a calibrated
            view with its uncertainty, and how the forecast moved after you had to commit. Reveal the outcome to see what
            the wind actually did.
          </>
        }
      />

      <Card className="mb-4" busy={calendar.isFetching && !calendar.isPending}>
        {calendar.data ? (
          <DecisionCalendar days={calendar.data} selected={date} onSelect={setDate} reveal={reveal} calibrated={calibrated} />
        ) : calendar.isError ? (
          <ErrorState error={calendar.error} onRetry={() => calendar.refetch()} />
        ) : (
          <Skeleton className="h-20" />
        )}
      </Card>

      {decision.isError ? (
        <ErrorState error={decision.error} onRetry={() => decision.refetch()} />
      ) : !view ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[480px] lg:col-span-2" />
          <Skeleton className="h-[480px]" />
        </div>
      ) : (
        <div className={decision.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <ContextBar
            view={view}
            onSelect={setDate}
            calibrated={calibrated}
            setCalibrated={setCalibrated}
            reveal={reveal}
            setReveal={setReveal}
          />

          <div className="grid gap-4 xl:grid-cols-3">
            <Card
              className="flex flex-col xl:col-span-2"
              title="Wind generation, GW"
              subtitle={`Auction day ${fmtDate(view.decision_date)} and delivery day ${fmtDate(view.delivery_date)} · UK time`}
              actions={
                <Legend
                  items={[
                    { label: reveal ? "Actual" : "Actual (known at gate)", color: C.actual },
                    { label: "Forecast in hand", color: C.forecast },
                    ...(calibrated
                      ? [
                          { label: "Calibrated", color: C.calibrated },
                          { label: "80% range", color: C.calibrated, kind: "area" as const },
                        ]
                      : []),
                  ]}
                />
              }
            >
              <div className="min-h-[380px] flex-1">
                <DecisionChart view={view} showCalibrated={calibrated} reveal={reveal} />
              </div>
              <p className="mt-3 text-[12px] text-ink-3">
                Left of the gate line is what had already happened when you bid; the shaded block is the day you were
                buying for.
                {!reveal && " The actual for that period is hidden until you reveal it."}
              </p>
            </Card>

            <DecisionSummary view={view} calibrated={calibrated} reveal={reveal} onReveal={() => setReveal(true)} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title="How the forecast for this day evolved"
              subtitle="Every forecast run published in the 48 hours before delivery"
              actions={
                <Legend
                  items={[
                    { label: "Earlier runs", color: C.ink3 },
                    { label: `Decision run (${fmtTime(view.forecast_run.publish_time)})`, color: C.forecast },
                    { label: "Later runs, after gate", color: C.later },
                    ...(reveal ? [{ label: "Actual", color: C.actual }] : []),
                  ]}
                />
              }
            >
              <VintageChart view={view} reveal={reveal} />
            </Card>
            <Card title="Day total by forecast run, GWh" subtitle="Each run's view of the delivery day's wind energy">
              <RunEnergyChart view={view} reveal={reveal} />
            </Card>
          </div>

          <Card
            className="mt-4"
            title="Hourly detail"
            subtitle="Exact values for the delivery day, as a table"
            actions={
              <>
                <Button onClick={() => setShowTable(!showTable)}>{showTable ? "Hide table" : "Show table"}</Button>
                <LinkButton
                  href={apiUrl(`/api/export/decisions/${view.decision_date}.csv`, { gate })}
                  icon={<Download className="h-3.5 w-3.5" aria-hidden />}
                >
                  Export CSV
                </LinkButton>
              </>
            }
          >
            {showTable ? (
              <DecisionTable view={view} reveal={reveal} />
            ) : (
              <p className="text-[13px] text-ink-3">24 hourly rows: raw and calibrated forecast, 80% range{reveal ? ", actual and errors" : ""}.</p>
            )}
          </Card>
        </div>
      )}

      {meta.isError && <ErrorState error={meta.error} onRetry={() => meta.refetch()} />}
    </>
  );
}

function ContextBar({
  view,
  onSelect,
  calibrated,
  setCalibrated,
  reveal,
  setReveal,
}: {
  view: DecisionView;
  onSelect: (date: string) => void;
  calibrated: boolean;
  setCalibrated: (v: boolean) => void;
  reveal: boolean;
  setReveal: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => view.previous_decision_date && onSelect(view.previous_decision_date)}
          disabled={!view.previous_decision_date}
          title="Previous auction day"
          icon={<ChevronLeft className="h-4 w-4" aria-hidden />}
        />
        <div>
          <div className="text-[17px] font-semibold tracking-tight text-ink">Auction on {fmtLongDate(view.decision_date)}</div>
          <div className="text-[12px] text-ink-2">
            Gate closure {fmtTime(view.gate_closure)} UK · buying for {fmtLongDate(view.delivery_date)} (
            {fmtDayTime(view.delivery_start)} → {fmtDayTime(view.delivery_end)})
          </div>
        </div>
        <Button
          onClick={() => view.next_decision_date && onSelect(view.next_decision_date)}
          disabled={!view.next_decision_date}
          title="Next auction day"
          icon={<ChevronRight className="h-4 w-4" aria-hidden />}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={calibrated} onChange={setCalibrated} label="Calibrated view" swatch={C.calibrated} />
        <Switch checked={reveal} onChange={setReveal} label="Reveal actual" swatch={C.actual} />
      </div>
    </div>
  );
}

function DecisionSummary({
  view,
  calibrated,
  reveal,
  onReveal,
}: {
  view: DecisionView;
  calibrated: boolean;
  reveal: boolean;
  onReveal: () => void;
}) {
  const { energy, calibration, forecast_run: run, stats } = view;
  const planGwh = calibrated ? energy.calibrated_gwh : energy.forecast_gwh;
  const rawError = energy.actual_gwh ? (100 * (energy.forecast_gwh - energy.actual_gwh)) / energy.actual_gwh : null;
  const calError = energy.actual_gwh ? (100 * (energy.calibrated_gwh - energy.actual_gwh)) / energy.actual_gwh : null;
  const revision =
    energy.latest_before_delivery_gwh !== null ? energy.latest_before_delivery_gwh - energy.forecast_gwh : null;
  const windowDays = Math.round((toMs(calibration.as_of) - toMs(calibration.window_start)) / 86_400_000);

  return (
    <div className="grid content-start gap-4">
      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <div className="col-span-2">
            <Stat
              label={calibrated ? "Expected wind energy (calibrated)" : "Expected wind energy (raw forecast)"}
              value={fmtGWh(planGwh)}
              swatch={calibrated ? C.calibrated : C.forecast}
              sub={
                calibrated ? (
                  <>
                    80% range {fmtGWh(energy.low_gwh, 0)} – {fmtGWh(energy.high_gwh, 0)} · raw forecast {fmtGWh(energy.forecast_gwh)}
                  </>
                ) : (
                  <>Turn on the calibrated view for a bias-corrected figure and an 80% range.</>
                )
              }
            />
          </div>
          <Stat
            label="Forecast in hand"
            value={`${fmtTime(run.publish_time)} run`}
            sub={`${run.minutes_before_gate} min before gate · ${fmtHours(run.lead_min_h)}–${fmtHours(run.lead_max_h)} ahead`}
          />
          <Stat
            label="Calibration factor"
            value={calibration.applied ? `× ${calibration.factor.toFixed(3)}` : "Not applied"}
            sub={
              calibration.applied
                ? `From ${calibration.n.toLocaleString("en-GB")} forecast/actual pairs, ${windowDays} days to gate`
                : "Too little history before this gate closure"
            }
          />
          <Stat label="Peak (calibrated)" value={fmtGW(view.peak.mw, 1)} sub={`at ${fmtDayTime(view.peak.time)}`} />
          <Stat label="Trough (calibrated)" value={fmtGW(view.trough.mw, 1)} sub={`at ${fmtDayTime(view.trough.time)}`} />
        </div>
      </Card>

      <Card title="After the gate closed">
        {revision !== null ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Later runs moved the day&apos;s total to <span className="font-semibold text-ink">{fmtGWh(energy.latest_before_delivery_gwh)}</span>{" "}
            ({revision >= 0 ? "+" : "−"}
            {Math.abs(revision).toFixed(1)} GWh). That information arrived too late for the auction; it can only be traded
            intraday.
          </p>
        ) : (
          <p className="text-[13px] text-ink-3">No complete run was published between gate closure and delivery.</p>
        )}
      </Card>

      <Card title="Outcome">
        {reveal && energy.actual_gwh !== null ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <div className="col-span-2">
              <Stat label="Wind delivered" value={fmtGWh(energy.actual_gwh)} swatch={C.actual} />
            </div>
            <Stat label="Raw forecast error" value={fmtSignedPct(rawError)} sub={`Hourly MAE ${fmtGW(stats.raw?.mae)}`} />
            <Stat label="Calibrated error" value={fmtSignedPct(calError)} sub={`Hourly MAE ${fmtGW(stats.calibrated?.mae)}`} />
            {rawError !== null && calError !== null && (
              <p className="col-span-2 text-[13px] text-ink-2">
                {Math.abs(calError) < Math.abs(rawError)
                  ? `Calibration closed ${(Math.abs(rawError) - Math.abs(calError)).toFixed(1)} points of the daily energy gap.`
                  : `The raw forecast was closer today, by ${(Math.abs(calError) - Math.abs(rawError)).toFixed(1)} points.`}
              </p>
            )}
            <p className="col-span-2 text-[12px] text-ink-3">
              Positive = forecast above actual: the shortfall had to be bought after the auction.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-ink-3">Hidden, as it was at gate closure.</p>
            <Button onClick={onReveal} icon={reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}>
              Reveal actual
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
