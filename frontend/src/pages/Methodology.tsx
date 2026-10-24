import type { ReactNode } from "react";

import { useMeta } from "../api/queries";
import { Card, PageHeader } from "../components/ui";
import { fmtDayTime } from "../lib/format";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="space-y-3 text-[14px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </Card>
  );
}

export default function Methodology() {
  const meta = useMeta();
  const cal = meta.data?.calibration;
  const data = meta.data?.data;

  return (
    <>
      <PageHeader
        title="Methodology"
        description="How every number in WindDesk is defined, so the desk can rely on it and challenge it."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="The decision we model">
          <p>
            The GB day-ahead auctions run the day before delivery. WindDesk models the{" "}
            <strong>N2EX auction (gate closure 09:50 UK)</strong> by default and the{" "}
            <strong>EPEX SPOT auction (09:20 UK)</strong> as an alternative; switch with the selector in the header.
          </p>
          <p>
            Each auction buys a <strong>delivery day running 23:00 to 23:00 UK time</strong>. The pilot covers every
            auction held in January 2026: decisions on 1–31 January, delivering 2 January to 1 February.
          </p>
          <p>All times are handled in UK local time, so the rules stay correct across clock changes.</p>
        </Section>

        <Section title="Which forecast counts">
          <p>
            For each hour being bought, the forecast that counts is <strong>the most recent WINDFOR run published at
            or before gate closure</strong> that covers that hour. Runs published later are shown for context but never
            used for the decision.
          </p>
          <p>
            The <strong>fixed lead time</strong> view applies the same rule with cutoff = target hour − N hours, for N
            from 0 to 48. It shows how accuracy depends on how far ahead a forecast is made. Forecast rows for hours
            already in the past at publication are discarded.
          </p>
        </Section>

        <Section title="How we measure error">
          <p>
            <strong>Error = forecast − actual</strong>, in MW, matched on the hour start. Positive means over-forecast:
            less wind arrived than planned, so the shortfall had to be bought later.
          </p>
          <p>
            We report <strong>MAE</strong> (typical miss), <strong>bias</strong> (systematic direction),{" "}
            <strong>RMSE</strong> (weights large misses), <strong>P10/P50/P90 of error</strong> and the{" "}
            <strong>P90 absolute error</strong> (a bad-but-normal hour). Daily energy compares forecast MWh (hourly
            values × 1 h) with actual MWh (half-hourly values × 0.5 h) over each delivery day.
          </p>
        </Section>

        <Section title="The calibrated view">
          <p>
            January shows a persistent over-forecast that grows with wind level, which suits a multiplicative correction.
            For each auction, the calibrated forecast is <strong>raw forecast × k</strong>, where k = Σ actual ÷ Σ
            forecast over the {cal?.window_days ?? 7} days before gate closure.
          </p>
          <p>
            The <strong>80% range</strong> is the raw forecast × the P{(cal?.band_quantiles[0] ?? 0.1) * 100} and P
            {(cal?.band_quantiles[1] ?? 0.9) * 100} of actual ÷ forecast over the same window.
          </p>
          <p>
            Only forecasts made {cal?.lead_range_h[0] ?? 12}–{cal?.lead_range_h[1] ?? 40} hours ahead (day-ahead-like)
            are used, and only actuals that had been <strong>published by gate closure</strong>. Nothing after the
            decision is used, so the backtest shows what the desk would really have seen. An automated test checks this.
          </p>
        </Section>

        <Section title="Data">
          <p>
            <strong>Forecasts:</strong> Elexon BMRS dataset <code>WINDFOR</code> (national wind generation forecast,
            hourly, about 8 runs a day). <strong>Actuals:</strong> <code>FUELHH</code> with fuel type{" "}
            <code>WIND</code> (half-hourly metered output). No other data is used.
          </p>
          {data && (
            <p>
              The app serves a snapshot of {data.forecast_runs.toLocaleString("en-GB")} forecast runs (
              {data.forecast_rows.toLocaleString("en-GB")} rows) and {data.actual_rows.toLocaleString("en-GB")} half-hours
              of actuals, fetched {fmtDayTime(data.fetched_at)} UK. A week before 1 January is loaded only to warm up the
              calibration.
            </p>
          )}
        </Section>

        <Section title="Assumptions & limitations">
          <ul className="list-disc space-y-2 pl-5">
            <li>National level only; WINDFOR and FUELHH both cover metered wind. Embedded (distribution-connected) wind is in neither.</li>
            <li>The over-forecast pattern is consistent with curtailment at high wind, but these datasets alone cannot prove the cause.</li>
            <li>The calibration is deliberately simple and transparent. It is a baseline to beat, not a forecasting model.</li>
            <li>Daily 80% ranges add up hourly range edges, so they are conservative: they assume errors move together all day.</li>
            <li>One month of winter data: summer behaviour and other weather regimes may differ.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
