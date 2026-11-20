/**
 * Date-only helpers. Everything here works on 'YYYY-MM-DD' strings and UTC
 * arithmetic so results never depend on the server's time zone.
 */

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');

/** Today's date ('YYYY-MM-DD') in the application time zone. */
function todayInAppTz(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch (_) {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Normalise whatever the database driver gives us for a DATE column
 * (Date object or string) into 'YYYY-MM-DD'. mysql2 builds Date objects from
 * the *local* components, so local getters are the correct way to read them.
 */
function toDateStr(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const s = String(value).trim();
  return DATE_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
}

/** Strictly validate 'YYYY-MM-DD' (rejects things like 2026-02-31). */
function isValidDateStr(value) {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Add one recurrence period to a date. Monthly/yearly steps are clamped to the
 * end of shorter months but keep the original day-of-month (anchorDay), so a
 * schedule starting on Jan 31 goes Feb 28 -> Mar 31 instead of drifting to the 28th.
 */
function addPeriod(dateStr, recurrenceType, anchorDay) {
  const [y, m, d] = dateStr.split('-').map(Number);
  switch (recurrenceType) {
    case 'DAILY':
      return addDays(dateStr, 1);
    case 'WEEKLY':
      return addDays(dateStr, 7);
    case 'MONTHLY': {
      const idx = m - 1 + 1;
      const year = y + Math.floor(idx / 12);
      const month = ((idx % 12) + 12) % 12;
      const day = Math.min(anchorDay || d, daysInMonth(year, month));
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    }
    case 'YEARLY': {
      const year = y + 1;
      const day = Math.min(anchorDay || d, daysInMonth(year, m - 1));
      return `${year}-${pad(m)}-${pad(day)}`;
    }
    default:
      throw new Error(`Unknown recurrence type: ${recurrenceType}`);
  }
}

/** Advance a due date by whole periods until it is on or after `target`. */
function advanceToOnOrAfter(dateStr, recurrenceType, anchorDay, target, maxSteps = 5000) {
  let current = dateStr;
  let steps = 0;
  while (current < target && steps < maxSteps) {
    current = addPeriod(current, recurrenceType, anchorDay);
    steps += 1;
  }
  return current;
}

module.exports = {
  APP_TIMEZONE,
  todayInAppTz,
  toDateStr,
  isValidDateStr,
  addDays,
  addPeriod,
  advanceToOnOrAfter,
};
