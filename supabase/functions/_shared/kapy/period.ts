// Date periods, resolved in Malaysia time (Asia/Kuala_Lumpur, UTC+8).
//
// Malaysia has no daylight saving, so MYT is a fixed +8h offset and the
// arithmetic here needs no time-zone database. What matters is the boundary: a
// receipt stamped 00:30 on 1 November in Kuala Lumpur is 16:30 on 31 October in
// UTC. A server that slices "November" at UTC midnight would file it in
// October — and that is wrong for eight hours of every single day.
//
// "Today" is a calendar day in MYT. A period is a run of whole MYT days,
// expressed as a half-open interval [startUtc, endUtc) of real instants, which
// is exactly what a `timestamptz` range filter wants.
//
// Weeks run Monday to Sunday, as the app's streak strip does.
//
// No imports: runs unchanged under Deno and the Node test runner.

const DAY_MS = 86_400_000;
const MYT_OFFSET_MS = 8 * 3_600_000;

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const MAX_RANGE_DAYS = 366;

export type PeriodSpec =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "this_week" }
  | { kind: "last_week" }
  | { kind: "this_month" }
  | { kind: "last_month" }
  | { kind: "month"; year: number; month: number }
  | { kind: "last_n_days"; days: number }
  | { kind: "last_n_months"; months: number }
  | { kind: "range"; from: string; to: string };

export interface ResolvedPeriod {
  spec: PeriodSpec;
  /** A readable name, e.g. "November 2026" or "1 Nov – 7 Nov 2026". */
  label: string;
  /** First and last day, inclusive, as YYYY-MM-DD in Malaysia time. */
  fromDate: string;
  toDate: string;
  /** Half-open instant interval for database filters. */
  startUtc: string;
  endUtc: string;
  startMs: number;
  endMs: number;
  /** Days in the period. */
  days: number;
  /** Days from the start up to and including today (clamped to 0..days). */
  elapsedDays: number;
  /** True once every day of the period is in the past. */
  complete: boolean;
  /** True when the period is exactly one calendar month. */
  isCalendarMonth: boolean;
}

export type PeriodResult =
  | { ok: true; period: ResolvedPeriod }
  | { ok: false; error: string };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export const monthName = (month: number): string => MONTH_NAMES[month - 1] ?? String(month);

// ── calendar-day arithmetic ─────────────────────────────────

/** Whole days since 1970-01-01 for a calendar date; day numbers add like integers. */
const dayNumber = (year: number, month: number, day: number): number =>
  Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);

function fromDayNumber(dn: number): { year: number; month: number; day: number } {
  const d = new Date(dn * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const ymd = (dn: number): string => {
  const { year, month, day } = fromDayNumber(dn);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
};

/** The Malaysian calendar day containing `at`, as a day number. */
const todayNumber = (at: number): number => Math.floor((at + MYT_OFFSET_MS) / DAY_MS);

export interface MytParts {
  year: number;
  month: number;
  day: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** YYYY-MM-DD */
  date: string;
  /** Hour 0-23 in Malaysia. */
  hour: number;
}

export function mytParts(at: number): MytParts {
  const dn = todayNumber(at);
  const { year, month, day } = fromDayNumber(dn);
  const weekday = (((dn + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday (= 3)
  const hour = new Date(at + MYT_OFFSET_MS).getUTCHours();
  return { year, month, day, weekday, date: ymd(dn), hour };
}

/** The instant of midnight at the start of a Malaysian calendar day. */
const startOfDayMs = (dn: number): number => dn * DAY_MS - MYT_OFFSET_MS;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function parseYmd(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dn = dayNumber(y, mo, d);
  // Reject impossible dates such as 2026-02-31, which Date.UTC would roll over.
  const back = fromDayNumber(dn);
  return back.year === y && back.month === mo && back.day === d ? dn : null;
}

// ── validation of a spec (tool arguments, client context) ───

/**
 * Accepts only a well-formed spec; anything else is null. Used on model tool
 * arguments and on the context echoed back by the client, neither of which is
 * trusted.
 */
export function parsePeriodSpec(raw: unknown): PeriodSpec | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "today":
    case "yesterday":
    case "this_week":
    case "last_week":
    case "this_month":
    case "last_month":
      return { kind: r.kind };
    case "month":
      return isInt(r.year) && isInt(r.month) && r.year >= MIN_YEAR && r.year <= MAX_YEAR && r.month >= 1 && r.month <= 12
        ? { kind: "month", year: r.year, month: r.month }
        : null;
    case "last_n_days":
      return isInt(r.days) && r.days >= 1 && r.days <= MAX_RANGE_DAYS
        ? { kind: "last_n_days", days: r.days }
        : null;
    case "last_n_months":
      return isInt(r.months) && r.months >= 1 && r.months <= 12
        ? { kind: "last_n_months", months: r.months }
        : null;
    case "range": {
      const a = parseYmd(r.from);
      const b = parseYmd(r.to);
      if (a === null || b === null || b < a || b - a + 1 > MAX_RANGE_DAYS) return null;
      return { kind: "range", from: r.from as string, to: r.to as string };
    }
    default:
      return null;
  }
}

// ── resolution ──────────────────────────────────────────────

function build(
  spec: PeriodSpec,
  startDn: number,
  endDn: number, // exclusive
  today: number,
  label: string,
  isCalendarMonth: boolean
): ResolvedPeriod {
  const days = endDn - startDn;
  const startMs = startOfDayMs(startDn);
  const endMs = startOfDayMs(endDn);
  return {
    spec,
    label,
    fromDate: ymd(startDn),
    toDate: ymd(endDn - 1),
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    startMs,
    endMs,
    days,
    elapsedDays: Math.max(0, Math.min(days, today - startDn + 1)),
    complete: today >= endDn,
    isCalendarMonth,
  };
}

/** "22 Nov 2026" for a YYYY-MM-DD date. */
export function dateLabel(ymdString: string): string {
  const dn = parseYmd(ymdString);
  return dn === null ? ymdString : dayLabel(dn);
}

const dayLabel = (dn: number) => {
  const { year, month, day } = fromDayNumber(dn);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
};

function rangeLabel(startDn: number, endDn: number): string {
  if (endDn - 1 === startDn) return dayLabel(startDn);
  const a = fromDayNumber(startDn);
  const b = fromDayNumber(endDn - 1);
  if (a.year === b.year) {
    return `${a.day} ${MONTH_SHORT[a.month - 1]} – ${b.day} ${MONTH_SHORT[b.month - 1]} ${b.year}`;
  }
  return `${dayLabel(startDn)} – ${dayLabel(endDn - 1)}`;
}

/** Shifts a (year, month) by `delta` months. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

export function resolvePeriod(spec: PeriodSpec, now: number): PeriodResult {
  const parsed = parsePeriodSpec(spec);
  if (!parsed) return { ok: false, error: "invalid_period" };

  const today = todayNumber(now);
  const t = mytParts(now);

  const monthPeriod = (year: number, month: number): ResolvedPeriod => {
    const next = shiftMonth(year, month, 1);
    return build(
      parsed,
      dayNumber(year, month, 1),
      dayNumber(next.year, next.month, 1),
      today,
      `${monthName(month)} ${year}`,
      true
    );
  };

  switch (parsed.kind) {
    case "today":
      return { ok: true, period: build(parsed, today, today + 1, today, `Today (${dayLabel(today)})`, false) };
    case "yesterday":
      return { ok: true, period: build(parsed, today - 1, today, today, `Yesterday (${dayLabel(today - 1)})`, false) };
    case "this_week": {
      const monday = today - t.weekday;
      return { ok: true, period: build(parsed, monday, monday + 7, today, `This week (${rangeLabel(monday, monday + 7)})`, false) };
    }
    case "last_week": {
      const monday = today - t.weekday - 7;
      return { ok: true, period: build(parsed, monday, monday + 7, today, `Last week (${rangeLabel(monday, monday + 7)})`, false) };
    }
    case "this_month":
      return { ok: true, period: { ...monthPeriod(t.year, t.month), spec: parsed } };
    case "last_month": {
      const m = shiftMonth(t.year, t.month, -1);
      return { ok: true, period: { ...monthPeriod(m.year, m.month), spec: parsed } };
    }
    case "month":
      return { ok: true, period: { ...monthPeriod(parsed.year, parsed.month), spec: parsed } };
    case "last_n_days": {
      const start = today - parsed.days + 1;
      return { ok: true, period: build(parsed, start, today + 1, today, `Last ${parsed.days} days (${rangeLabel(start, today + 1)})`, false) };
    }
    case "last_n_months": {
      const first = shiftMonth(t.year, t.month, -(parsed.months - 1));
      const last = shiftMonth(t.year, t.month, 1);
      const start = dayNumber(first.year, first.month, 1);
      const end = dayNumber(last.year, last.month, 1);
      return {
        ok: true,
        period: build(
          parsed,
          start,
          end,
          today,
          `Last ${parsed.months} months (${MONTH_SHORT[first.month - 1]} ${first.year} – ${MONTH_SHORT[t.month - 1]} ${t.year})`,
          false
        ),
      };
    }
    case "range": {
      const a = parseYmd(parsed.from) as number;
      const b = parseYmd(parsed.to) as number;
      return { ok: true, period: build(parsed, a, b + 1, today, rangeLabel(a, b + 1), false) };
    }
  }
}

/** Convenience: resolves or throws. For code paths where the spec is already known-good. */
export function mustResolve(spec: PeriodSpec, now: number): ResolvedPeriod {
  const r = resolvePeriod(spec, now);
  if (!r.ok) throw new Error(r.error);
  return r.period;
}

/**
 * The calendar months covering the last `count` months, oldest first, ending
 * with the current one. Used for trends.
 */
export function recentMonthSpecs(count: number, now: number): PeriodSpec[] {
  const t = mytParts(now);
  const specs: PeriodSpec[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = shiftMonth(t.year, t.month, -i);
    specs.push({ kind: "month", year: m.year, month: m.month });
  }
  return specs;
}

/** Whether two specs mean the same thing (used when carrying context forward). */
export const samePeriodSpec = (a: PeriodSpec, b: PeriodSpec): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
