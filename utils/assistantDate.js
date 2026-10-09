/**
 * assistantDate — reads "which day is this message about?" from free text
 * written in English, Hinglish (Hindi in Roman letters) or Devanagari.
 *
 * Pure JavaScript with no database and no packages, so it can be tested on
 * its own (see tests/assistantDate.test.mjs).
 *
 * analyzeDatePhrase(text, now?) returns:
 *   {
 *     date:      "YYYY-MM-DD" | null   the day the message is about
 *     ambiguous: boolean               true when the message names two
 *                                      different days (e.g. "kal ... aaj ...")
 *                                      — the caller should ask the AI instead
 *                                      of guessing
 *     cleaned:   string                the text with the date words and their
 *                                      numbers removed, so a later parser does
 *                                      not mistake "3 din pehle" for "3 rounds"
 *   }
 *
 * Rules worth knowing:
 *   - This app only logs practice that is already done, so a date in the
 *     future is never returned ("kal" always means yesterday).
 *   - Fractions ("1/2 ghanta") and ranges ("2-3 hours", "5-6 rounds") are NOT
 *     dates.
 *   - Dates are worked out in Indian Standard Time.
 */

const IST_MS = (5 * 60 + 30) * 60 * 1000;

// Letters and numbers in any script (so Devanagari words work like English
// ones). Plain \b only understands English letters.
const L = "\\p{L}\\p{M}\\p{N}_";
const BEFORE = `(?<![${L}])`;
const AFTER = `(?![${L}])`;
const W = (src) => new RegExp(`${BEFORE}(?:${src})${AFTER}`, "giu");

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const toAsciiDigits = (s) =>
  s.replace(/[०-९]/g, (ch) => String(DEVANAGARI_DIGITS.indexOf(ch)));

// ---- date helpers (calendar maths on {y,m,d}, no time zones involved) -----
const pad = (n) => String(n).padStart(2, "0");
const fmt = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;
const toUtc = ({ y, m, d }) => Date.UTC(y, m - 1, d);
const fromUtc = (ms) => {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * 86400000);
const isRealDate = ({ y, m, d }) => {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const todayIST = (now) => fromUtc((now instanceof Date ? now.getTime() : Date.now()) + IST_MS);
const isFuture = (ymd, today) => toUtc(ymd) > toUtc(today);
const weekdayOf = (ymd) => new Date(toUtc(ymd)).getUTCDay(); // 0 = Sunday

// ---- words ----------------------------------------------------------------
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, che: 6,
  saat: 7, aath: 8, nau: 9, das: 10,
};
const NUMBER_WORD_SRC = Object.keys(NUMBER_WORDS).join("|");

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_SRC = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const WEEKDAYS = {
  sunday: 0, sun: 0, ravivar: 0, ravivaar: 0, itvar: 0, itwar: 0, रविवार: 0,
  monday: 1, mon: 1, somvar: 1, somwar: 1, somvaar: 1, सोमवार: 1,
  tuesday: 2, tue: 2, tues: 2, mangalvar: 2, mangalwar: 2, mangalvaar: 2, मंगलवार: 2,
  wednesday: 3, wed: 3, budhvar: 3, budhwar: 3, budhvaar: 3, बुधवार: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, guruvar: 4, guruwar: 4, guruvaar: 4, brihaspativar: 4, veervar: 4, गुरुवार: 4, बृहस्पतिवार: 4,
  friday: 5, fri: 5, shukravar: 5, shukrawar: 5, shukravaar: 5, शुक्रवार: 5,
  saturday: 6, sat: 6, shanivar: 6, shaniwar: 6, shanivaar: 6, शनिवार: 6,
};
// "sun", "mon", "sat" and similar short forms are real English words or
// common abbreviations; only accept them when they are clearly a day name.
const WEEKDAY_SHORT = new Set(["sun", "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat"]);
const WEEKDAY_SRC = Object.keys(WEEKDAYS).filter((w) => !WEEKDAY_SHORT.has(w)).join("|");

// Words that, when they follow a number, show the number is a quantity
// (hours, minutes, rounds ...) and NOT part of a date.
const UNIT_AFTER = new RegExp(
  `^\\s*(?:hours?|hrs?|hr|ghant[ae]?o?n?|ghanta|minutes?|mins?|min|rounds?|round|mala|malas|माला|घंटा|घंटे|मिनट|राउंड|times?|baar|din|days?|%)(?![${L}])`,
  "iu"
);
const FRACTIONS = new Set(["1/2", "1/3", "2/3", "1/4", "3/4", "1/8", "3/8", "5/8", "7/8", "1/5", "1/6"]);

// ---- main -------------------------------------------------------------------
/**
 * Finds every date phrase in the text. Each hit is
 *   { date: {y,m,d}, start, end, weak?: true }
 * (start/end are positions in the prepared text, used to cut the phrase out).
 */
function findDatePhrases(prepared, today) {
  const hits = [];
  const add = (date, m, extra = {}) => hits.push({ date, start: m.index, end: m.index + m[0].length, ...extra });
  const rel = (n) => addDays(today, -n);

  // ---- "N days ago" / "N din pehle" (digits or words) ----
  const daysAgo = new RegExp(
    `${BEFORE}(\\d{1,2}|${NUMBER_WORD_SRC})\\s*(?:days?\\s*ago|din\\s*(?:pehle|pahle|purva)|दिन\\s*(?:पहले|पूर्व))${AFTER}`,
    "giu"
  );
  for (const m of prepared.matchAll(daysAgo)) {
    const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NUMBER_WORDS[m[1].toLowerCase()];
    if (n >= 1 && n <= 31) add(rel(n), m);
  }
  // "two days ago" spelled out in full English
  // (covered above by NUMBER_WORD_SRC) — plus the fixed phrases:
  for (const m of prepared.matchAll(W("day\\s+before\\s+yesterday|parso|par-so|parson|parsoo|parsho|parsu|paraso|parsso|prso|परसों|परसो"))) add(rel(2), m);
  for (const m of prepared.matchAll(W("yesterday|yesterdy|yestarday|yesturday|yestrday|y'?day|last\\s+night|kal|kall|kaal|कल"))) {
    // "kal" is also the first part of "kal ke din ..." and similar; the word
    // boundary already keeps it out of names such as "kalpana".
    add(rel(1), m);
  }
  // Common ways of mistyping "kal" (cal, kl, caal). They also look like other
  // things, so they only count as "kal" when a Hindi helper word follows
  // ("cal ki chanting 3") or when they open the message ("cal chanting 3").
  const KAL_TYPOS = "cal|caal|kl";
  const kalTypoAfter = new RegExp(`${BEFORE}(?:${KAL_TYPOS})(?=\\s+(?:ki|ka|ke|ko|ne|me|mein|tak)${AFTER})`, "giu");
  const kalTypoStart = new RegExp(`^\\s*(?:${KAL_TYPOS})${AFTER}`, "iu");
  for (const m of prepared.matchAll(kalTypoAfter)) add(rel(1), m);
  {
    const m = prepared.match(kalTypoStart);
    if (m && !hits.some((h) => h.start === m.index + m[0].search(/\S/))) {
      const lead = m[0].search(/\S/);
      hits.push({ date: rel(1), start: m.index + lead, end: m.index + m[0].length });
    }
  }
  for (const m of prepared.matchAll(W("today|aaj|आज"))) add(rel(0), m);
  for (const m of prepared.matchAll(W("abhi|अभी"))) add(rel(0), m, { weak: true });

  // ---- 2026-09-22 ----
  for (const m of prepared.matchAll(new RegExp(`${BEFORE}(\\d{4})-(\\d{1,2})-(\\d{1,2})${AFTER}`, "gu"))) {
    const d = { y: +m[1], m: +m[2], d: +m[3] };
    if (isRealDate(d)) add(d, m);
  }

  // ---- 22/09/2026, 22-09-2026, 22.09.2026, 22/09/26, 22/09 ----
  const numeric = new RegExp(
    `${BEFORE}(\\d{1,2})([/.-])(\\d{1,2})(?:\\2(\\d{4}|\\d{2}))?(?![\\d${L}]|[/:.]\\d)`,
    "gu"
  );
  for (const m of prepared.matchAll(numeric)) {
    const a = +m[1], b = +m[3], sep = m[2], yearRaw = m[4];
    const tail = prepared.slice(m.index + m[0].length);
    const hasYear = !!yearRaw;
    // Quantities, not dates: "1/2 ghanta", "2-3 hours", "5-6 rounds", "4.30".
    if (UNIT_AFTER.test(tail)) continue;
    if (!hasYear && FRACTIONS.has(`${a}/${b}`) && sep === "/") continue;
    if (sep === "." && !hasYear) continue; // "4.30" is a time, not 4 April
    if (sep === "-" && !hasYear && a <= 12 && b <= 12) continue; // "5-6" is a range
    if (sep === "-" && !hasYear && a > 12 && b > 12) continue;
    // Day first (Indian style). If that is not a real date, give up rather
    // than guess month-first.
    const y0 = hasYear ? (yearRaw.length === 2 ? 2000 + +yearRaw : +yearRaw) : today.y;
    let d = { y: y0, m: b, d: a };
    if (!isRealDate(d)) continue;
    if (!hasYear && isFuture(d, today)) d = { ...d, y: d.y - 1 }; // e.g. "28/12" said in January
    if (!isRealDate(d)) continue;
    add(d, m, hasYear && isFuture(d, today) ? { future: true } : {});
  }

  // ---- 22 sep, 22nd september 2025, sep 22, september 22nd, 2025 ----
  const dayMonth = new RegExp(
    `${BEFORE}(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH_SRC})\\.?(?:\\s*,?\\s*(\\d{4}))?${AFTER}`,
    "giu"
  );
  const monthDay = new RegExp(
    `${BEFORE}(${MONTH_SRC})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?${AFTER}`,
    "giu"
  );
  const monthHit = (day, mon, yr, m) => {
    const hasYear = !!yr;
    let d = { y: hasYear ? +yr : today.y, m: MONTHS[mon.toLowerCase()], d: +day };
    if (!isRealDate(d)) return;
    // "5 oct 10 min" must not be read as year 10: the year, when given, is four digits.
    if (!hasYear && isFuture(d, today)) d = { ...d, y: d.y - 1 };
    if (!isRealDate(d)) return;
    add(d, m, hasYear && isFuture(d, today) ? { future: true } : {});
  };
  for (const m of prepared.matchAll(dayMonth)) {
    // "16 mar" could be a number followed by a short word; require that the
    // text after is not a unit (very rare) — otherwise accept as a date.
    monthHit(m[1], m[2], m[3], m);
  }
  for (const m of prepared.matchAll(monthDay)) monthHit(m[2], m[1], m[3], m);

  // ---- weekdays: "monday", "pichle somvar", "last friday" ----
  const wd = new RegExp(
    `${BEFORE}(?:(last|pichle|pichhle|pichhla|pichla|पिछले)\\s+)?(${WEEKDAY_SRC})${AFTER}`,
    "giu"
  );
  for (const m of prepared.matchAll(wd)) {
    const target = WEEKDAYS[m[2].toLowerCase()] ?? WEEKDAYS[m[2]];
    if (target === undefined) continue;
    const todayDow = weekdayOf(today);
    let back = (todayDow - target + 7) % 7;
    if (back === 0 && m[1]) back = 7; // "last monday" said on a Monday = a week ago
    add(rel(back), m);
  }
  return hits;
}

export function analyzeDatePhrase(text, now = new Date()) {
  const original = String(text ?? "");
  // Same length as the original so positions line up for the cut-out step.
  const prepared = toAsciiDigits(original);
  const today = todayIST(now);

  let hits = findDatePhrases(prepared, today);

  // A phrase inside a longer phrase is part of it: "yesterday" inside
  // "day before yesterday" must not count as a second date.
  hits = hits.filter(
    (h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && (o.start < h.start || o.end > h.end))
  );

  // Anything dated in the future is not something this app records.
  const futureHit = hits.some((h) => h.future || isFuture(h.date, today));
  hits = hits.filter((h) => !h.future && !isFuture(h.date, today));

  const strong = hits.filter((h) => !h.weak);
  const useful = strong.length ? strong : hits;
  const distinct = new Set(useful.map((h) => fmt(h.date)));

  // Cut every date phrase (and the weak "abhi") out of the text.
  const allHits = [...hits];
  allHits.sort((a, b) => a.start - b.start);
  let cleaned = "";
  let pos = 0;
  for (const h of allHits) {
    if (h.start < pos) continue;
    cleaned += original.slice(pos, h.start) + " ";
    pos = h.end;
  }
  cleaned += original.slice(pos);
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  if (distinct.size === 0) return { date: null, ambiguous: futureHit, cleaned };
  if (distinct.size > 1) return { date: null, ambiguous: true, cleaned };
  return { date: [...distinct][0], ambiguous: false, cleaned };
}

/** The date alone (kept for callers that only need that). */
export function extractDatePhrase(text, now = new Date()) {
  return analyzeDatePhrase(text, now).date;
}

/**
 * Cleans a date that came from somewhere we do not control (e.g. the AI).
 * Returns "YYYY-MM-DD" only for a real calendar date that is not in the
 * future and not more than a year old; otherwise null.
 */
export function sanitizeTargetDate(value, now = new Date()) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = { y: +m[1], m: +m[2], d: +m[3] };
  if (!isRealDate(d)) return null;
  const today = todayIST(now);
  if (isFuture(d, today)) return null;
  if (toUtc(today) - toUtc(d) > 366 * 86400000) return null;
  return fmt(d);
}
