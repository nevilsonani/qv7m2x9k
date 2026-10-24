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

/** Round a MW maximum up to a clean GW gridline. */
export function niceMaxMw(maxMw: number, stepMw = 2_500): number {
  return Math.max(stepMw, Math.ceil(maxMw / stepMw) * stepMw);
}
