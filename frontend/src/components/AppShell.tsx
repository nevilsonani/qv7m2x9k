import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useSearchParams } from "react-router";

import { useMeta } from "../api/queries";
import type { GateId } from "../api/types";
import { cx } from "../lib/cx";
import { fmtDayTime } from "../lib/format";
import { useTheme } from "../lib/theme";
import { useGate } from "../lib/urlState";
import { Segmented } from "./ui";

const NAV = [
  { to: "/", label: "Decision desk" },
  { to: "/accuracy", label: "Forecast accuracy" },
  { to: "/methodology", label: "Methodology" },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--surface-2)" />
      <path d="M7 12h12a3 3 0 1 0-3-3" fill="none" stroke="var(--c-forecast)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7 17h17a3 3 0 1 1-3 3" fill="none" stroke="var(--c-calibrated)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7 22h7" fill="none" stroke="var(--c-actual)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [gate, setGate] = useGate();
  const [theme, toggleTheme] = useTheme();
  const [params] = useSearchParams();
  const meta = useMeta();
  const gates = meta.data?.gates ?? [];
  // Keep the auction choice when moving between pages.
  const search = params.get("gate") ? `?gate=${params.get("gate")}` : "";

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <NavLink to={{ pathname: "/", search }} className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-ink">WindDesk</span>
            <span className="hidden rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-3 sm:inline">
              Pilot · Jan 2026
            </span>
          </NavLink>

          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={{ pathname: item.to, search }}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cx(
                    "rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                    isActive ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {gates.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="hidden text-[12px] text-ink-3 lg:inline">Auction gate closure</span>
                <Segmented<GateId>
                  label="Day-ahead auction gate closure"
                  size="sm"
                  value={gate}
                  onChange={setGate}
                  options={gates.map((g) => ({ value: g.id, label: g.label, title: g.description }))}
                />
              </div>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-line bg-surface-2 p-1.5 text-ink-2 hover:text-ink"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="mx-auto max-w-[1440px] px-4 pb-8 text-[12px] text-ink-3 sm:px-6">
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          <span>
            Data: Elexon BMRS — WINDFOR (wind generation forecast) and FUELHH (wind outturn), national level.
            {meta.data && ` Snapshot fetched ${fmtDayTime(meta.data.data.fetched_at)} UK.`}
          </span>
          <span>All times UK local · power in GW · energy in GWh</span>
        </div>
      </footer>
    </div>
  );
}
