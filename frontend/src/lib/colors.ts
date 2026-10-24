// Chart colours as CSS variables, so charts follow the theme without re-rendering logic.
export const C = {
  forecast: "var(--c-forecast)",
  actual: "var(--c-actual)",
  calibrated: "var(--c-calibrated)",
  later: "var(--c-later)",
  over: "var(--c-over)",
  under: "var(--c-under)",
  mid: "var(--c-mid)",
  delivery: "var(--c-delivery)",
  surface: "var(--surface)",
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  ink3: "var(--ink-3)",
  grid: "var(--grid)",
  axis: "var(--axis)",
} as const;

/**
 * Diverging fill for a signed error (%): red for over-forecast (shortfall risk),
 * blue for under-forecast, neutral grey at zero. Intensity saturates at `cap`.
 */
export function divergingFill(pct: number | null | undefined, cap = 40): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return C.mid;
  const strength = Math.round(Math.min(Math.abs(pct) / cap, 1) * 85);
  const pole = pct >= 0 ? C.over : C.under;
  return `color-mix(in oklab, ${pole} ${strength}%, ${C.mid})`;
}

/** Sequential fill (one hue, light to dark) for a magnitude in [min, max]. */
export function sequentialFill(value: number, min: number, max: number): string {
  const t = max > min ? (value - min) / (max - min) : 0;
  const strength = Math.round(12 + Math.min(Math.max(t, 0), 1) * 68);
  return `color-mix(in oklab, ${C.forecast} ${strength}%, ${C.surface})`;
}
