// All times are shown in UK local time; the API speaks UTC.
const UK = "Europe/London";

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: UK, ...options });

const timeFmt = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayTimeFmt = fmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFmt = fmt({ weekday: "short" });
const dayMonthFmt = fmt({ day: "numeric", month: "short" });
const hourFmt = fmt({ hour: "2-digit", hourCycle: "h23" });
// Calendar dates (YYYY-MM-DD) carry no time zone: format them as-is.
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const longDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));

/** "09:50" in UK time. */
export const fmtTime = (value: string | number | Date) => timeFmt.format(toDate(value));

/** "Thu 15 Jan, 09:50" in UK time. */
export const fmtDayTime = (value: string | number | Date) => dayTimeFmt.format(toDate(value));

/** "Thu" for a timestamp, in UK time. */
export const fmtWeekday = (value: string | number | Date) => weekdayFmt.format(toDate(value));

/** "15 Jan" for a timestamp, in UK time. */
export const fmtDayMonth = (value: string | number | Date) => dayMonthFmt.format(toDate(value));

/** Hour of day in UK time, 0-23. */
export const ukHour = (value: string | number | Date) => Number(hourFmt.format(toDate(value)));

/** "Thu 15 Jan" for a calendar date string. */
export const fmtDate = (isoDate: string) => dateFmt.format(new Date(`${isoDate}T00:00:00Z`));

/** "Thursday 15 January" for a calendar date string. */
export const fmtLongDate = (isoDate: string) => longDateFmt.format(new Date(`${isoDate}T00:00:00Z`));

/** Day of month for a calendar date string. */
export const dayOfMonth = (isoDate: string) => Number(isoDate.slice(8, 10));

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** MW → "12.34 GW". */
export const fmtGW = (mw: number | null | undefined, digits = 2) => (isNum(mw) ? `${(mw / 1000).toFixed(digits)} GW` : "—");

/** MW → "+1.73 GW" (signed). */
export const fmtSignedGW = (mw: number | null | undefined, digits = 2) =>
  isNum(mw) ? `${mw > 0 ? "+" : mw < 0 ? "−" : ""}${Math.abs(mw / 1000).toFixed(digits)} GW` : "—";

/** "12,345 MW". */
export const fmtMW = (mw: number | null | undefined) => (isNum(mw) ? `${Math.round(mw).toLocaleString("en-GB")} MW` : "—");

/** "164.6 GWh". */
export const fmtGWh = (gwh: number | null | undefined, digits = 1) => (isNum(gwh) ? `${gwh.toFixed(digits)} GWh` : "—");

/** "+4.9%" (signed). */
export const fmtSignedPct = (pct: number | null | undefined, digits = 1) =>
  isNum(pct) ? `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(digits)}%` : "—";

/** "84%" from a 0-1 share. */
export const fmtShare = (share: number | null | undefined) => (isNum(share) ? `${Math.round(share * 100)}%` : "—");

/** Axis tick: MW → "12" (GW, no unit). */
export const tickGW = (mw: number) => `${Math.round(mw / 1000)}`;

/** Hours → "13.5 h". */
export const fmtHours = (h: number | null | undefined) => (isNum(h) ? `${Number.isInteger(h) ? h : h.toFixed(1)} h` : "—");
