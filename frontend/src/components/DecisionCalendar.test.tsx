import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CalendarDay } from "../api/types";
import { DecisionCalendar } from "./DecisionCalendar";

const day = (n: number, errorPct: number): CalendarDay => ({
  decision_date: `2026-01-0${n}`,
  delivery_date: `2026-01-0${n + 1}`,
  forecast_gwh: 200 + n,
  calibrated_gwh: 180 + n,
  actual_gwh: 190,
  forecast_error_pct: errorPct,
  calibrated_error_pct: errorPct / 2,
  raw_mae: 1000,
  calibrated_mae: 800,
});

const DAYS = [day(1, 12), day(2, -8), day(3, 30)];

describe("DecisionCalendar", () => {
  it("marks the selected day and selects on click", async () => {
    const onSelect = vi.fn();
    render(<DecisionCalendar days={DAYS} selected="2026-01-02" onSelect={onSelect} reveal={false} calibrated />);
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getAllByRole("option")[2]);
    expect(onSelect).toHaveBeenCalledWith("2026-01-03");
  });

  it("steps with the arrow keys", async () => {
    const onSelect = vi.fn();
    render(<DecisionCalendar days={DAYS} selected="2026-01-02" onSelect={onSelect} reveal={false} calibrated />);
    screen.getAllByRole("option")[1].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onSelect).toHaveBeenLastCalledWith("2026-01-03");
    await userEvent.keyboard("{ArrowLeft}");
    expect(onSelect).toHaveBeenLastCalledWith("2026-01-02"); // focus followed to day 3, so left goes back to day 2
  });

  it("never shows the outcome before it is revealed", () => {
    const { rerender } = render(
      <DecisionCalendar days={DAYS} selected="2026-01-01" onSelect={() => {}} reveal={false} calibrated={false} />,
    );
    expect(screen.getAllByRole("option")[0].title).not.toMatch(/actual/i);
    rerender(<DecisionCalendar days={DAYS} selected="2026-01-01" onSelect={() => {}} reveal calibrated={false} />);
    expect(screen.getAllByRole("option")[0].title).toMatch(/actual 190\.0 GWh \(\+12\.0%\)/);
  });
});
