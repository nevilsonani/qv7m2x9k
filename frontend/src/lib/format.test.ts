import { describe, expect, it } from "vitest";

import {
  dayOfMonth,
  fmtDate,
  fmtGW,
  fmtGWh,
  fmtShare,
  fmtSignedGW,
  fmtSignedPct,
  fmtTime,
  tickGW,
  ukHour,
} from "./format";

describe("UK time formatting", () => {
  it("shows GMT times unchanged in winter", () => {
    expect(fmtTime("2026-01-15T09:50:00Z")).toBe("09:50");
  });

  it("shifts to BST in summer", () => {
    expect(fmtTime("2026-07-15T08:50:00Z")).toBe("09:50");
    expect(ukHour("2026-07-15T23:30:00Z")).toBe(0);
  });

  it("formats calendar dates without time-zone drift", () => {
    expect(fmtDate("2026-01-15")).toBe("Thu 15 Jan");
    expect(dayOfMonth("2026-01-05")).toBe(5);
  });
});

describe("number formatting", () => {
  it("formats power and energy", () => {
    expect(fmtGW(13026.6)).toBe("13.03 GW");
    expect(fmtGWh(164.58)).toBe("164.6 GWh");
    expect(tickGW(12_500)).toBe("13");
  });

  it("signs errors with a true minus", () => {
    expect(fmtSignedGW(1727)).toBe("+1.73 GW");
    expect(fmtSignedGW(-642.8)).toBe("−0.64 GW");
    expect(fmtSignedPct(-8.6)).toBe("−8.6%");
    expect(fmtSignedPct(0)).toBe("0.0%");
  });

  it("renders missing values as a dash", () => {
    expect(fmtGW(null)).toBe("—");
    expect(fmtGWh(undefined)).toBe("—");
    expect(fmtShare(Number.NaN)).toBe("—");
  });
});
