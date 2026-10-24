import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export function PageHeader({ title, description, children }: { title: string; description: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  busy,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  busy?: boolean;
}) {
  return (
    <section
      className={cx(
        "rounded-xl border border-line bg-surface p-5 transition-opacity duration-200",
        busy && "opacity-60",
        className,
      )}
      aria-busy={busy || undefined}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  swatch,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "risk" | "good" | "default";
  swatch?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
        {swatch && <span className="h-2 w-2 rounded-full" style={{ background: swatch }} aria-hidden />}
        {label}
      </div>
      <div
        className={cx(
          "mt-1 text-[22px] font-semibold leading-tight tracking-tight",
          tone === "risk" ? "text-risk" : tone === "good" ? "text-good" : "text-ink",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-ink-2">{sub}</div>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-md font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:text-ink",
              option.disabled && "cursor-not-allowed opacity-40 hover:text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  swatch,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pr-3 pl-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
    >
      <span
        className={cx(
          "relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-forecast" : "bg-line-strong",
        )}
        style={checked && swatch ? { background: swatch } : undefined}
        aria-hidden
      >
        <span
          className={cx(
            "absolute top-0.5 left-0 h-3 w-3 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  title,
  icon,
}: {
  children?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={children ? undefined : title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] font-medium text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, children, icon }: { href: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
    >
      {icon}
      {children}
    </a>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  kind?: "line" | "area" | "dot" | "bar";
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LegendSwatch color={item.color} kind={item.kind ?? "line"} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function LegendSwatch({ color, kind }: { color: string; kind: NonNullable<LegendItem["kind"]> }) {
  if (kind === "area")
    return (
      <span
        className="h-2.5 w-4 rounded-sm"
        style={{ background: `color-mix(in oklab, ${color} 30%, transparent)` }}
        aria-hidden
      />
    );
  if (kind === "dot") return <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />;
  if (kind === "bar") return <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />;
  return <span className="h-0.5 w-4 rounded-full" style={{ background: color }} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-surface-2", className)} aria-hidden />;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-line bg-surface p-5 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden />
      <div>
        <p className="font-medium text-ink">Couldn&apos;t load this view</p>
        <p className="mt-1 text-ink-2">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 text-[13px] font-medium text-forecast hover:underline">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
      {children}
    </span>
  );
}
