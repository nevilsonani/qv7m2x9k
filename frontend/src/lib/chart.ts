import { C } from "./colors";
import { fmtTime, fmtWeekday, ukHour } from "./format";

const HOUR_MS = 3_600_000;

// Recessive chrome shared by every chart: hairline axis, no tick marks, muted labels.
export const axisProps = {
  stroke: C.axis,
  tickLine: false,
  tick: { fill: C.ink3, fontSize: 11 },
} as const;

export const gridProps = { stroke: C.grid, vertical: false } as const;

export const toMs = (iso: string) => Date.parse(iso);

/** Ticks every `stepH` hours aligned to UK local midnight. */
export function timeTicks(startMs: number, endMs: number, stepH: number): number[] {
  const ticks: number[] = [];
  let t = Math.ceil(startMs / HOUR_MS) * HOUR_MS;
  while (t <= endMs) {
    if (ukHour(t) % stepH === 0) ticks.push(t);
    t += HOUR_MS;
  }
  return ticks;
}

/** "Thu" at midnight, "06:00" otherwise. */
export function timeTickLabel(ms: number): string {
  return ukHour(ms) === 0 ? fmtWeekday(ms) : fmtTime(ms);
}

/** A 0-based MW axis with gridlines on round GW values (1, 2 or 5 GW apart). */
export function gwScale(maxMw: number): { max: number; ticks: number[] } {
  const step = maxMw > 12_000 ? 5_000 : maxMw > 5_000 ? 2_000 : 1_000;
  const max = Math.max(step, Math.ceil(maxMw / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}
