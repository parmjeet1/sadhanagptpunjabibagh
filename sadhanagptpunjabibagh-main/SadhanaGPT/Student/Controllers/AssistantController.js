import moment from "moment";
import db from "../../../config/database.js";
import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import {
  saveActivityEntry,
  calculateDailySadhanaScore,
} from "./StudentController.js";
import { interpretWithGpt5Nano, transcribeAudio } from "../../../utils/openaiService.js";

/**
 * ============================================================================
 * AssistantController — backend for the SadhnaAssistant chatbot widget.
 * ============================================================================
 *
 * Implements the 9 endpoints that src/sadhna-assistant's
 * RealSadhnaGptAdapter (frontend) calls, per INTEGRATION.md's contract:
 *
 *   getActivities              -> GET  /assistant/activities
 *   getTodayActivities         -> GET  /assistant/activities/today
 *   getYesterdayActivities     -> GET  /assistant/activities/yesterday
 *   updateActivity              -> POST /assistant/activities/update
 *   getActivitiesForDate        -> GET  /assistant/activities/by-date/:date
 *   updateActivityForDate       -> POST /assistant/activities/update-for-date
 *   getTodayMarks               -> GET  /assistant/marks/today
 *   getLast7DaysMarks           -> GET  /assistant/marks/last7days
 *   interpretNaturalLanguage    -> POST /assistant/nlp/interpret
 *
 * All routes sit behind the same Authorization + apiAuthentication
 * middleware as the rest of the student API, so user_id is always the
 * securely-resolved one from the access token (never trust a client-sent
 * user_id here) — see middleware/apiAuthenticationMiddleware.js.
 *
 * Every handler talks to the SAME `fix_activities` / `daily_report` tables
 * and reuses the SAME marks engine (`saveActivityEntry`,
 * `calculateDailySadhanaScore`) as the rest of the student app, so numbers
 * shown in the chatbot always match the dashboard.
 */

const IST_OFFSET = "+05:30";
const today = () => moment().utcOffset(IST_OFFSET).format("YYYY-MM-DD");
const yesterday = () => moment().utcOffset(IST_OFFSET).subtract(1, "days").format("YYYY-MM-DD");

// ---------------------------------------------------------------------------
// activity_type (DB) <-> ActivityDefinition.type (widget) mapping
// ---------------------------------------------------------------------------
const DB_TO_WIDGET_TYPE = {
  numb: "number",
  min: "duration",
  time: "time",
  yes_no: "boolean",
  boolean: "boolean",
};

const dbTypeToWidgetType = (activity_type) => DB_TO_WIDGET_TYPE[activity_type] || "number";

function inferCategory(name = "") {
  const n = name.toLowerCase();
  if (n.includes("chant") && (n.includes("time") || n.includes("complet") || n.includes("finish"))) {
    return "chanting_completion_time";
  }
  if (n.includes("chant") || n.includes("mala") || n.includes("round") || n.includes("japa")) return "chanting";
  if (n.includes("wake") || n.includes("uth")) return "wakeup";
  if (n.includes("mangal") || n.includes("aarti") || n.includes("arti")) return "mangal_aarti";
  if (n.includes("hear") || n.includes("lecture") || n.includes("pravachan") || n.includes("class") || n.includes("suna")) return "hearing";
  if (n.includes("read") || n.includes("book") || n.includes("padh")) return "reading";
  if (n.includes("rest") || n.includes("nap")) return "day_rest";
  if (n.includes("sleep") || n.includes("bed") || n.includes("soya")) return "sleep";
  return "custom";
}

const CATEGORY_ICON = {
  chanting: "beads",
  chanting_completion_time: "beads",
  wakeup: "sunrise",
  mangal_aarti: "diya",
  hearing: "headphones",
  reading: "book",
  day_rest: "moon",
  sleep: "moon",
  custom: "sparkle",
};
const inferIcon = (category) => CATEGORY_ICON[category] || "sparkle";

// ---------------------------------------------------------------------------
// Time conversion. This app stores clock-times (wakeup/sleep/etc.) in
// `daily_report.count` in TWO different shapes depending on which code path
// wrote them:
//   - via addSadhna/saveActivityEntry: "h:mm AM/PM" (e.g. "4:25 AM"), the
//     output of the app-wide `minutesToTime()` helper.
//   - the widget always speaks 24h "HH:MM" (its native <input type="time">
//     shape, also what interpretNaturalLanguage returns for type "time").
// These helpers translate between minutes-since-midnight (what
// saveActivityEntry's `count` param expects for a time-type activity) and
// the widget's "HH:MM" string.
// ---------------------------------------------------------------------------
function hhmm24ToMinutes(str) {
  if (typeof str !== "string") return NaN;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return NaN;
  return h * 60 + mm;
}

function minutesTo24h(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return null;
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Parses the "h:mm AM/PM" (or plain numeric-minutes, for legacy rows)
// strings this app stores for time-type activities back into minutes.
function dbTimeStringToMinutes(val) {
  if (val === null || val === undefined || val === "") return NaN;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  if (!isNaN(Number(str))) return Number(str);
  const m = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return NaN;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

// DB stored value -> value shape the widget expects for that activity type.
function dbCountToWidgetValue(activity_type, dbValue) {
  if (dbValue === null || dbValue === undefined || dbValue === "") return null;
  if (activity_type === "time") {
    return minutesTo24h(dbTimeStringToMinutes(dbValue));
  }
  if (activity_type === "yes_no" || activity_type === "boolean") {
    return Number(dbValue) === 1 || dbValue === true || dbValue === "true";
  }
  const n = Number(dbValue);
  return isNaN(n) ? dbValue : n;
}

// Widget-submitted value -> the `count` shape saveActivityEntry expects.
function widgetValueToDbCount(activity_type, value) {
  if (value === null || value === undefined || value === "") return null;
  if (activity_type === "time") {
    const mins = hhmm24ToMinutes(String(value));
    return isNaN(mins) ? null : mins;
  }
  if (activity_type === "yes_no" || activity_type === "boolean") {
    if (typeof value === "boolean") return value ? 1 : 0;
    const s = String(value).trim().toLowerCase();
    if (["true", "yes", "1", "attended", "done"].includes(s)) return 1;
    if (["false", "no", "0", "missed", "not_today"].includes(s)) return 0;
    return null;
  }
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function rowToActivityDefinition(row) {
  const type = dbTypeToWidgetType(row.activity_type);
  const category = inferCategory(row.name);
  const def = {
    activity_id: String(row.activity_id),
    name: row.name,
    type,
    category,
    icon: inferIcon(category),
    active: true, // fix_activities only holds a user's currently-assigned activities
  };

  if (type === "number") {
    def.unit = row.unit || "rounds";
    const goal = Number(row.target);
    if (!isNaN(goal) && goal > 0) {
      def.goal = goal;
      def.quickOptions = [...new Set([
        Math.round(goal / 4),
        Math.round(goal / 2),
        Math.round(goal * 0.75),
        goal,
      ])].filter((v) => v > 0).sort((a, b) => a - b);
    }
  } else if (type === "duration") {
    def.unit = row.unit || "minutes";
    const goal = Number(row.target);
    if (!isNaN(goal) && goal > 0) {
      def.goal = goal;
      def.quickOptions = [...new Set([
        Math.round(goal / 2),
        goal,
        Math.round(goal * 1.5),
        goal * 2,
      ])].filter((v) => v > 0).sort((a, b) => a - b);
    }
  }
  // type "time"/"boolean": no unit/goal — the widget's own presets handle those.

  return def;
}

async function fetchActivityDefinitions(user_id) {
  const [rows] = await db.execute(
    `SELECT activity_id, name, description, unit, activity_type, target
     FROM fix_activities WHERE user_id = ?`,
    [user_id]
  );
  return rows.map(rowToActivityDefinition);
}

async function fetchActivityRecords(user_id, dateStr) {
  const [rows] = await db.execute(
    `SELECT fa.activity_id, fa.activity_type, dr.count, dr.updated_at, dr.created_at
     FROM fix_activities fa
     LEFT JOIN daily_report dr
       ON dr.activity_id = fa.activity_id AND dr.user_id = fa.user_id AND DATE(dr.activity_date) = ?
     WHERE fa.user_id = ?`,
    [dateStr, user_id]
  );
  return rows.map((row) => ({
    activity_id: String(row.activity_id),
    value: dbCountToWidgetValue(row.activity_type, row.count),
    recordedAt: row.updated_at || row.created_at || undefined,
  }));
}

// ============================================================================
// 1. getActivities
// ============================================================================
export const assistantGetActivities = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const data = await fetchActivityDefinitions(user_id);
  return resp.json({ status: 1, code: 200, data });
});

// ============================================================================
// 2. getTodayActivities
// ============================================================================
export const assistantGetTodayActivities = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const data = await fetchActivityRecords(user_id, today());
  return resp.json({ status: 1, code: 200, data });
});

// ============================================================================
// 3. getYesterdayActivities
// ============================================================================
export const assistantGetYesterdayActivities = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const data = await fetchActivityRecords(user_id, yesterday());
  return resp.json({ status: 1, code: 200, data });
});

// ============================================================================
// 5. getActivitiesForDate
// ============================================================================
export const assistantGetActivitiesForDate = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const { date } = req.params;
  if (!date || !moment(date, "YYYY-MM-DD", true).isValid()) {
    return resp.json({ status: 0, code: 422, message: ["A valid date (YYYY-MM-DD) is required"] });
  }
  const data = await fetchActivityRecords(user_id, date);
  return resp.json({ status: 1, code: 200, data });
});

// ---------------------------------------------------------------------------
// Shared update logic for #3 updateActivity and #6 updateActivityForDate
// ---------------------------------------------------------------------------
async function applyActivityUpdate({ user_id, activity_id, value, activity_date }) {
  const [[activityInfo]] = await db.execute(
    `SELECT activity_id, activity_type, unit FROM fix_activities WHERE activity_id = ? AND user_id = ? LIMIT 1`,
    [activity_id, user_id]
  );

  if (!activityInfo) {
    return { success: false, error: "That activity could not be found." };
  }

  const count = widgetValueToDbCount(activityInfo.activity_type, value);
  if (count === null) {
    return { success: false, error: "Could not understand the value for this activity." };
  }

  const saveResult = await saveActivityEntry({
    activity_id,
    count,
    activity_date,
    user_id,
    unit: activityInfo.unit,
  });

  if (!saveResult || saveResult.status !== 1) {
    return {
      success: false,
      error: (Array.isArray(saveResult?.message) ? saveResult.message[0] : saveResult?.message) || "Failed to save activity.",
    };
  }

  return {
    success: true,
    record: {
      activity_id: String(activity_id),
      value,
      recordedAt: moment().utcOffset(IST_OFFSET).toISOString(),
    },
  };
}

// ============================================================================
// 4. updateActivity
// ============================================================================
export const assistantUpdateActivity = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const { activity_id, value } = req.body || {};

  if (!activity_id) {
    return resp.json({ status: 0, code: 422, success: false, error: "activity_id is required" });
  }

  const result = await applyActivityUpdate({ user_id, activity_id, value, activity_date: today() });
  return resp.json({ status: result.success ? 1 : 0, code: result.success ? 200 : 422, ...result });
});

// ============================================================================
// 6. updateActivityForDate
// ============================================================================
export const assistantUpdateActivityForDate = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const { activity_id, value, date } = req.body || {};

  if (!activity_id || !date) {
    return resp.json({ status: 0, code: 422, success: false, error: "activity_id and date are required" });
  }

  const result = await applyActivityUpdate({ user_id, activity_id, value, activity_date: date });
  return resp.json({ status: result.success ? 1 : 0, code: result.success ? 200 : 422, ...result });
});

// ============================================================================
// 7. getTodayMarks
// ============================================================================
export const assistantGetTodayMarks = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const todayStr = today();
  const yesterdayStr = yesterday();

  const [todayScore, yesterdayScore, countsResult] = await Promise.all([
    calculateDailySadhanaScore(user_id, todayStr),
    calculateDailySadhanaScore(user_id, yesterdayStr),
    db.execute(
      `SELECT
         (SELECT COUNT(*) FROM fix_activities WHERE user_id = ?) AS totalActiveCount,
         (SELECT COUNT(*) FROM daily_report WHERE user_id = ? AND DATE(activity_date) = ? AND count IS NOT NULL AND count <> '') AS completedCount`,
      [user_id, user_id, todayStr]
    ),
  ]);

  const counts = countsResult[0][0] || {};

  return resp.json({
    status: 1,
    code: 200,
    data: {
      marks: todayScore.percentage,
      maxMarks: 100,
      yesterdayMarks: yesterdayScore.percentage,
      completedCount: Number(counts.completedCount) || 0,
      totalActiveCount: Number(counts.totalActiveCount) || 0,
    },
  });
});

// ============================================================================
// 8. getLast7DaysMarks
// ============================================================================
export const assistantGetLast7DaysMarks = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push(moment().utcOffset(IST_OFFSET).subtract(i, "days").format("YYYY-MM-DD"));
  }

  const scores = await Promise.all(days.map((d) => calculateDailySadhanaScore(user_id, d)));

  const data = days.map((d, idx) => ({
    date: d,
    label: moment(d).format("ddd"),
    marks: scores[idx].percentage,
  }));

  return resp.json({ status: 1, code: 200, data });
});

// ============================================================================
// 9. interpretNaturalLanguage
// ----------------------------------------------------------------------------
// Two-tier interpretation:
//   1. A fast, free, local regex/keyword pass (`regexInterpret`) — handles
//      the common, unambiguous cases ("16 rounds", "woke at 4:25", "30 min
//      hearing") instantly and at zero AI cost.
//   2. Only when that pass finds NOTHING does this fall back to GPT-5 nano
//      (the cheapest OpenAI model) for real natural-language understanding
//      of freer phrasing, Hinglish, negation, multi-activity messages, etc.
//   If GPT-5 nano also can't relate the message to any activity, the user is
//   told to mention something relevant to their sadhana instead of the
//   assistant guessing.
// ============================================================================

const TIME_TRIGGERS = {
  wakeup: /\b(?:woke|wake ?up|wakeup|utha|uthi|uth gaya|uth gayi|got up)\b/,
  sleep: /\b(?:sleep|slept|soya|so gaya|so gayi|went to bed|bed time)\b/,
  chanting_completion_time: /\b(?:chanting (?:complete|completed|finished|done)|rounds? (?:complete|completed|done)|finished chanting)\b/,
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function regexInterpret(text, activities) {
  const lower = String(text || "").toLowerCase();
  const updates = [];

  for (const a of activities) {
    if (updates.some((u) => u.activity_id === a.activity_id)) continue;
    const nameEsc = escapeRegex(a.name.toLowerCase());

    if (a.type === "number" || a.type === "duration") {
      const unitWord = a.type === "duration"
        ? "(?:min(?:ute)?s?|mins?|hrs?|hours?|ghanta|ghante|ghanton)"
        : "(?:rounds?|round|mala|malas)";
      const patterns = [
        new RegExp(`(\\d{1,4})\\s*${unitWord}[^\\d\\n]{0,20}${nameEsc}`),
        new RegExp(`${nameEsc}[^\\d\\n]{0,20}(\\d{1,4})\\s*${unitWord}`),
        new RegExp(`(\\d{1,4})\\s*${unitWord}\\s+(?:of\\s+)?${nameEsc}`),
        new RegExp(`${nameEsc}[^\\d\\n]{0,12}(\\d{1,4})\\b`),
        new RegExp(`(\\d{1,4})[^\\d\\n]{0,12}${nameEsc}`),
      ];
      let matched = false;
      for (const re of patterns) {
        const m = lower.match(re);
        if (m) {
          const val = Number(m[1]);
          if (!isNaN(val)) {
            updates.push({ activity_id: a.activity_id, value: val });
            matched = true;
          }
          break;
        }
      }
      if (!matched) {
        const negRe = new RegExp(`(?:no|didn'?t|couldn'?t|nahi)[^\\n]{0,12}${nameEsc}`);
        if (negRe.test(lower)) updates.push({ activity_id: a.activity_id, value: 0 });
      }
    } else if (a.type === "boolean") {
      const negRe = new RegExp(`${nameEsc}[^\\n]{0,15}(?:no|nahi|missed|not attended)|(?:missed|didn'?t (?:do|attend))[^\\n]{0,15}${nameEsc}`);
      const posRe = new RegExp(`${nameEsc}[^\\n]{0,15}(?:yes|done|attended|hua|ki|kiya)|(?:attended|did|went to)[^\\n]{0,15}${nameEsc}`);
      if (negRe.test(lower)) updates.push({ activity_id: a.activity_id, value: false });
      else if (posRe.test(lower)) updates.push({ activity_id: a.activity_id, value: true });
    } else if (a.type === "time") {
      const trigger = TIME_TRIGGERS[a.category];
      if (trigger && trigger.test(lower)) {
        // A duration-unit word anywhere in the message means the number
        // near this trigger is almost certainly a DURATION, not a clock
        // time — e.g. "din me 1 ghanta soya" (1 hour of day rest) must
        // NOT be read as "slept at 1 o'clock". Bail out to the AI fallback
        // rather than risk a wrong local guess.
        const hasDurationUnit = /\b(?:ghanta|ghante|ghanton|hour|hours|hrs?|min(?:ute)?s?|mins?)\b/.test(lower);
        if (hasDurationUnit) continue;

        // Only accept a genuinely unambiguous clock time here — an
        // explicit am/pm, "baje", or an HH:MM with a colon. A bare lone
        // digit ("1", "4") is too easy to misread out of context, so
        // without one of these markers this is left for the AI fallback
        // (which reads the whole sentence, not just a nearby number).
        const m =
          lower.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/) ||
          lower.match(/(\d{1,2})\s*(am|pm)/) ||
          lower.match(/(\d{1,2})(?:[:.](\d{2}))?\s*baje/);
        if (m) {
          let hour = parseInt(m[1], 10);
          let minute = 0;
          let meridiem = null;
          if (/am|pm/.test(m[0])) {
            // Could be either the "(\d)[:.](\d{2}) (am|pm)" or "(\d) (am|pm)" match.
            minute = m[2] && /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : 0;
            meridiem = m[0].match(/am|pm/)[0];
          } else {
            // "<h>[:.<mm>] baje" match
            minute = m[2] ? parseInt(m[2], 10) : 0;
          }
          if (!isNaN(hour) && hour <= 23 && minute <= 59) {
            if (meridiem === "pm" && hour < 12) hour += 12;
            if (meridiem === "am" && hour === 12) hour = 0;
            if (!meridiem && a.category === "sleep" && hour < 12) hour += 12;
            updates.push({
              activity_id: a.activity_id,
              value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
            });
          }
        }
      }
    }
  }

  if (updates.length > 0) {
    return { intent: "update_activities", updates, confidence: 0.85 };
  }
  return { intent: "unrecognized", updates: [] };
}

// ---------------------------------------------------------------------------
// Date-phrase detection — deterministic, cheap, and ALWAYS runs (even ahead
// of the AI fallback) so "kal ki chanting 26 mala" resolves to yesterday's
// date regardless of which tier (regex or AI) ends up parsing "26 mala".
// Returns an ISO "YYYY-MM-DD" string, or null if the message doesn't
// mention a date at all (in which case the frontend keeps using whatever
// date is already active in that chat session).
// ---------------------------------------------------------------------------
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function extractDatePhrase(text) {
  const lower = String(text || "").toLowerCase();
  const now = moment().utcOffset(IST_OFFSET);

  // "day before yesterday" / "parso" must be checked before "yesterday"/"kal".
  if (/\b(parso|par-so|din pehle|day before yesterday|2 days ago|two days ago)\b/.test(lower)) {
    return now.clone().subtract(2, "days").format("YYYY-MM-DD");
  }
  if (/\b(kal|yesterday|y'?day|last night)\b/.test(lower)) {
    // "kal" is technically ambiguous in Hindi (yesterday OR tomorrow), but
    // this app only ever LOGS past practice, so a future date never makes
    // sense here — always resolve it to yesterday.
    return now.clone().subtract(1, "days").format("YYYY-MM-DD");
  }
  if (/\b(\d+)\s*days?\s*ago\b/.test(lower)) {
    const n = parseInt(lower.match(/\b(\d+)\s*days?\s*ago\b/)[1], 10);
    if (!isNaN(n) && n > 0 && n <= 31) return now.clone().subtract(n, "days").format("YYYY-MM-DD");
  }
  if (/\b(aaj|today|abhi)\b/.test(lower)) {
    return now.format("YYYY-MM-DD");
  }

  // Explicit dates: "2026-09-23", "23/09/2026", "23-09", "23 sep", "sep 23".
  const isoMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const m = moment(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, "YYYY-M-D", true);
    if (m.isValid() && !m.isAfter(now, "day")) return m.format("YYYY-MM-DD");
  }
  const dmyMatch = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dmyMatch) {
    const yr = dmyMatch[3] ? (dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3]) : now.format("YYYY");
    const m = moment(`${yr}-${dmyMatch[2]}-${dmyMatch[1]}`, "YYYY-M-D", true);
    if (m.isValid() && !m.isAfter(now, "day")) return m.format("YYYY-MM-DD");
  }
  const monthNamePattern = `(?:${MONTH_NAMES.join("|")})[a-z]*`;
  const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})\\s*(${monthNamePattern})\\b`));
  const monthDay = lower.match(new RegExp(`\\b(${monthNamePattern})\\s*(\\d{1,2})\\b`));
  const nameMatch = dayMonth || monthDay;
  if (nameMatch) {
    const str = dayMonth ? `${dayMonth[1]} ${dayMonth[2]}` : `${monthDay[1]} ${monthDay[2]}`;
    const m = moment(`${str} ${now.format("YYYY")}`, ["D MMM YYYY", "MMM D YYYY"], true);
    if (m.isValid() && !m.isAfter(now, "day")) return m.format("YYYY-MM-DD");
  }

  return null;
}

// ============================================================================
// 10. transcribeVoiceNote — speech-to-text fallback for browsers (notably
// iOS Safari/webviews) that don't support the Web Speech API at all, so the
// mic works on every device, not just Chrome/Android. Frontend records a
// short clip with MediaRecorder and posts it here as base64; this is the
// only place that audio ever leaves the device, and the only place
// OPENAI_API_KEY is used for it.
// ============================================================================
export const assistantTranscribeVoiceNote = asyncHandler(async (req, resp) => {
  const { audio, mimeType } = req.body || {};

  if (!audio || typeof audio !== "string") {
    return resp.json({ status: 0, code: 422, message: ["audio (base64) is required"] });
  }

  try {
    const base64 = audio.includes(",") ? audio.split(",").pop() : audio;
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length === 0) {
      return resp.json({ status: 0, code: 422, message: ["Empty audio"] });
    }
    // Guard against absurdly long recordings inflating cost.
    if (buffer.length > 9 * 1024 * 1024) {
      return resp.json({ status: 0, code: 413, message: ["Voice note is too long — please keep it under ~60 seconds."] });
    }

    const text = await transcribeAudio(buffer, mimeType || "audio/webm");
    return resp.json({ status: 1, code: 200, data: { text } });
  } catch (err) {
    console.error("[assistantTranscribeVoiceNote] failed:", err?.message || err);
    return resp.json({ status: 0, code: 500, message: ["Could not transcribe that — please try typing instead."] });
  }
});

export const assistantInterpretNL = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const { text, context, forceAI } = req.body || {};

  if (!text || !String(text).trim()) {
    return resp.json({ status: 1, code: 200, data: { intent: "unrecognized", updates: [] } });
  }

  // Never trust client-supplied activity identity for security/consistency —
  // always resolve this user's real activities from our own database. The
  // client-supplied context is only used as a hint for `today` state.
  const activities = await fetchActivityDefinitions(user_id);

  if (activities.length === 0) {
    return resp.json({
      status: 1,
      code: 200,
      data: {
        intent: "unrecognized",
        updates: [],
        clarification: "You don't have any sadhana activities set up yet.",
      },
    });
  }

  // Date detection is deterministic and always runs, independent of which
  // tier resolves the activity values themselves.
  const detectedDate = extractDatePhrase(text);

  // 1. Fast, free, local pass first — skipped entirely when the caller asks
  //    for a forced AI re-check (used by the chat's "Ask AI to re-check"
  //    button after a wrong local guess).
  if (!forceAI) {
    const regexResult = regexInterpret(text, activities);
    if (regexResult.intent === "update_activities" && regexResult.updates.length > 0) {
      return resp.json({
        status: 1,
        code: 200,
        data: { ...regexResult, target_date: detectedDate || undefined },
      });
    }
  }

  // 2. Fall back to GPT-5 nano when the regex pass found nothing (or was
  //    skipped for a forced re-check).
  try {
    const aiResult = await interpretWithGpt5Nano(text, {
      activities,
      today: Array.isArray(context?.today) ? context.today : undefined,
      todayDate: today(),
    });

    if (aiResult.intent === "unrecognized") {
      aiResult.clarification =
        aiResult.clarification ||
        "I couldn't relate that to your sadhana. Try mentioning something about your practice — e.g. rounds chanted, wake-up time, hearing/reading minutes, or mangal aarti.";
    }

    // Prefer our own deterministic date detection; fall back to whatever
    // date (if any) the model itself picked out of the sentence.
    const target_date = detectedDate || aiResult.target_date || undefined;

    return resp.json({ status: 1, code: 200, data: { ...aiResult, target_date } });
  } catch (err) {
    console.error("[assistantInterpretNL] GPT-5 nano fallback failed:", err?.message || err);
    return resp.json({
      status: 1,
      code: 200,
      data: {
        intent: "clarification_required",
        updates: [],
        clarification: "Something went wrong understanding that — could you rephrase, e.g. '16 rounds, 30 min hearing, woke at 4:25'?",
      },
    });
  }
});
