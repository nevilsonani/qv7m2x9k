import { AlertTriangle, Info, TrendingDown } from "lucide-react";

import type { Insight } from "../api/types";
import { Skeleton } from "./ui";

const TONE = {
  risk: { icon: AlertTriangle, label: "Risk", className: "text-risk" },
  opportunity: { icon: TrendingDown, label: "Opportunity", className: "text-good" },
  info: { icon: Info, label: "Finding", className: "text-ink-3" },
} as const;

export function InsightCards({ insights, loading }: { insights: Insight[] | undefined; loading: boolean }) {
  if (loading && !insights) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {insights?.map((insight) => {
        const tone = TONE[insight.tone];
        const Icon = tone.icon;
        return (
          <li key={insight.id} className="rounded-xl border border-line bg-surface p-4">
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase ${tone.className}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tone.label}
            </div>
            <p className="mt-2 text-[15px] leading-snug font-semibold text-ink">{insight.headline}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{insight.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
