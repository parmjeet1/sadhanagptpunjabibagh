// Small, dependency-free helpers for the Reading + Lectures feature.
// Kept free of imports on purpose so they can be unit tested without a database.

export const BOOK_STATUSES = ["not_started", "ongoing", "completed", "skipped"];

export const isValidBookStatus = (s) => BOOK_STATUSES.includes(s);

/** Trims, collapses inner spaces; "" / non-text -> null; longer than max -> undefined (invalid). */
export const cleanText = (value, max) => {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? undefined : s;
};

/** Empty -> null; a normal http(s) link (no spaces, up to 500 chars) -> the link; anything else -> undefined (invalid). */
export const cleanLink = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > 500 || /\s/.test(s) || !/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s)) return undefined;
  return s;
};

/** Today's date in India (IST) as YYYY-MM-DD. `now` can be passed in for tests. */
export const todayIST = (now = Date.now()) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/** A real calendar date written YYYY-MM-DD? */
export const isRealDate = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Dates to store for a status change.
 *  existing: { status, started_at, completed_at } or null (strings YYYY-MM-DD)
 *  date: optional date the person gave (never in the future; checked by the caller)
 */
export const statusDates = (status, existing, today, date = null) => {
  const prev = existing || {};
  switch (status) {
    case "ongoing":
      return { started_at: date || prev.started_at || today, completed_at: null };
    case "completed": {
      const finished = date || (prev.status === "completed" && prev.completed_at) || today;
      // the start can never be after the finish
      const started = prev.started_at && prev.started_at <= finished ? prev.started_at : finished;
      return { started_at: started, completed_at: finished };
    }
    case "skipped":
      return { started_at: prev.started_at || null, completed_at: null };
    default: // not_started
      return { started_at: null, completed_at: null };
  }
};

/** Counts for the progress summary. rows: [{status}] (status null = not started). */
export const summarize = (rows) => {
  const out = { total: 0, completed: 0, ongoing: 0, skipped: 0, not_started: 0 };
  for (const r of rows) {
    out.total += 1;
    const s = isValidBookStatus(r.status) ? r.status : "not_started";
    out[s] += 1;
  }
  return out;
};

/**
 * The "heard on" date: empty -> today; a real date that is not in the future -> that date;
 * anything else -> undefined (invalid).
 */
export const cleanHeardOn = (value, today) => {
  if (value === undefined || value === null || value === "") return today;
  if (!isRealDate(value) || value > today) return undefined;
  return value;
};
