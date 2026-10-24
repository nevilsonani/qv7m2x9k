export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Shared hover card. Text stays in ink colours; the swatch carries series identity. */
export function TooltipCard({ title, rows, footer }: { title: string; rows: TooltipRow[]; footer?: string }) {
  return (
    <div className="min-w-48 rounded-lg border border-line bg-surface px-3 py-2.5 text-[12px] shadow-xl shadow-black/20">
      <div className="mb-1.5 font-medium text-ink">{title}</div>
      <dl className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-ink-2">
              {row.color && <span className="h-2 w-2 rounded-full" style={{ background: row.color }} aria-hidden />}
              {row.label}
            </dt>
            <dd className="num font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      {footer && <div className="mt-2 border-t border-line pt-1.5 text-[11px] text-ink-3">{footer}</div>}
    </div>
  );
}
