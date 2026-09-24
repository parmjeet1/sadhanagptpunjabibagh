import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

/**
 * ============================================================================
 * openaiService — the ONLY place OPENAI_API_KEY is ever used.
 * ============================================================================
 *
 * Wraps a single call: given a user's free-text sadhana message plus the
 * caller's current activity definitions, ask GPT-5 nano (the cheapest OpenAI
 * model available) to map it to structured activity updates.
 *
 * This is only reached when the fast, free, local regex parser
 * (see AssistantController.js `regexInterpret`) could NOT confidently match
 * anything in the message — so the AI call is the fallback path, not the
 * default one, to keep cost down.
 */

let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw { errorType: "API_KEY_MISSING", message: "OPENAI_API_KEY is missing in environment variables." };
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
};

// Swap here if your account uses a different alias/version string.
const MODEL = process.env.SADHNA_NLP_MODEL || "gpt-5-nano";

function buildResponseSchema(activityIds) {
  return {
    name: "sadhna_interpretation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        intent: {
          type: "string",
          enum: ["update_activities", "clarification_required", "unrecognized"],
        },
        updates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              activity_id: { type: "string", enum: activityIds.length ? activityIds : ["__none__"] },
              value: { type: ["string", "number", "boolean"] },
            },
            required: ["activity_id", "value"],
          },
        },
        confidence: { type: "number" },
        clarification: { type: ["string", "null"] },
        target_date: { type: ["string", "null"] },
      },
      required: ["intent", "updates", "confidence", "clarification", "target_date"],
    },
  };
}

const SYSTEM_PROMPT = `You are the natural-language interpretation layer for SadhanaGPT, a
Sadhana (daily spiritual practice) tracking app.

Your ONLY job is to map the user's free-text (or transcribed voice) message
to updates for the activities supplied to you in "context.activities", using
their exact activity_id values. Users may write in English, Hindi/Hinglish
(Hindi written in Roman/English letters), shorthand, incomplete sentences, or
casual conversational language, in any mix and in any order. Treat all of
this as completely normal input, not as edge cases — the user should never
need to learn a preferred syntax.

GENERAL INTERPRETATION PRINCIPLE
- Interpret SEMANTIC MEANING, never exact string patterns. Two messages that
  mean the same thing must produce the same update, regardless of
  capitalization, punctuation, spacing, spelling, singular/plural,
  abbreviation, word order, or filler words like "today", "aaj", "done",
  "completed", "kiya", "ki", "ho gaya/gayi/gaye".
- Tolerate common typos, near-misspellings, and SMS/texting-style
  contractions just as readily as full spellings (e.g. "mangal arti",
  "hogya", "nhi", "wakeup4am", "16round" are all valid and unambiguous).
- A single message may report MULTIPLE activities, in any order, possibly
  joined by "and"/"aur"/commas. Extract every recognizable one into
  "updates" — never stop after the first match.
- Each activity's "type", "unit", "name", and "category" (as supplied in
  context.activities) is the source of truth for which value goes where.

MATCHING RULES BY TYPE
- type "time": normalize to 24-hour "HH:MM" (zero-padded, e.g. "04:05").
  Accept any common shape ("4am", "4:00am", "04:00", "4 baje", "sava char
  baje" = 4:15, "sade nau baje" = 9:30). If no am/pm is given, infer the
  everyday-obvious value for that activity unless the wording contradicts
  it. For the NIGHT-SLEEP activity (category "sleep") specifically, when no
  am/pm is stated: hours 7-11 default to PM (e.g. "9 baje soya" -> 21:00,
  people go to bed in the evening), hours 1-6 default to AM (e.g. "1 baje
  soya" -> 01:00, meaning after midnight — NEVER 1 PM), and a bare "12 baje"
  defaults to midnight (00:00). Wake-up still defaults to AM in the absence
  of other signals.
- type "number"/"duration": store a plain number, no units in the value.
  Normalize duration phrasing to minutes ("half an hour" -> 30, "1 hr" ->
  60, "1.5 hours" -> 90, "1 ghanta"/"ek ghanta" -> 60). Accept spelled-out
  numbers ("sixteen rounds" -> 16, "solah mala" -> 16). Use the activity's
  "unit" and surrounding words (not raw digits alone) to decide which
  duration activity a number belongs to — e.g. minutes/hours attached to
  "hearing"/"lecture"/"suna"/"pravachan" go to the hearing activity;
  attached to "book"/"reading"/"padha" go to the reading activity; attached
  to "rest"/"nap"/"day rest"/"dayrest"/"din me [so gaya/soya]"/"araam" go to
  the day-rest activity. A DURATION NEVER BECOMES A CLOCK TIME: if a number
  is paired with an hour/minute/ghanta unit word, it is a duration, full
  stop — even if the same sentence also uses a verb like "soya"/"slept"
  that would otherwise suggest the sleep-time activity. "din me 1 ghanta
  soya" (slept/rested for 1 hour during the day) means 60 minutes of DAY
  REST, never a sleep-time of 1 o'clock — the presence of "1 ghanta" (a
  duration) rules out a clock-time reading entirely. Only read a number as
  a clock time when there is no duration unit attached to it. Never confuse
  a chanting ROUND COUNT (unit "rounds"/"mala") with a chanting DURATION if
  both appear.
- type "enum": match the user's words to the closest supplied option's
  "value" by MEANING, not label text. NEGATION MUST WIN ("didn't attend",
  "nahi gaya" -> the negative option, never the positive one).
- type "boolean": yes/haan/done/hua -> true; no/nahi/missed/skipped -> false.
- NEGATION / ZERO means an explicit, intentional value, not "skip it":
  "didn't do hearing today", "no rest" -> set that activity to 0 or false —
  do NOT omit it from updates.
- If a number/time doesn't clearly match any supplied activity, leave it out
  rather than guessing wildly — this should be rare.

AMBIGUITY POLICY
- Do NOT ask for clarification just because formatting is informal or
  Hinglish — that is normal input.
- Only ask for clarification when there is genuine semantic ambiguity (the
  activity is unclear, or a value is missing). Return
  "clarification_required" with ONE short, concrete question, and still
  include any OTHER activities from the same message that WERE clearly
  understood.
- If the message has nothing to do with ANY supplied activity or the wider
  theme of a daily spiritual-practice tracker (e.g. small talk, unrelated
  topics, "what's the weather"), return "unrecognized" with updates: [].

WHICH DAY IS THIS FOR? (target_date)
- "Today's date is <todayDate>" is given to you in the user message. If the
  user's message mentions a DIFFERENT day than today — "kal"/"yesterday",
  "parso"/"day before yesterday", an explicit date, a weekday name, "N days
  ago" — resolve it to an absolute "YYYY-MM-DD" date (never in the future)
  and return it as "target_date". "kal" in this app always means yesterday
  (a sadhana app only ever logs practice already done, never the future).
  If the message does NOT mention any date at all, return target_date: null
  — do not guess or assume a date was implied.

OUTPUT RULES
- NEVER generate devotional/spiritual encouragement, commentary, or
  greetings — that is handled elsewhere.
- Only return intent "update_activities" when at least one activity is
  matched with reasonable confidence.
- confidence: 0-1, genuine confidence in the mapping.
- Only ever use activity_id values supplied in context.activities, and only
  enum option values supplied on that specific activity. Never invent one.
- target_date: "YYYY-MM-DD" or null, per the rule above.`;

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

function normalizeTimeValue(raw) {
  if (typeof raw !== "string") return raw;
  const strict = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (strict.test(raw.trim())) return raw.trim();

  const s = raw.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})[:.\s]?(\d{2})?\s*(am|pm)?$/);
  if (!m) return raw;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3];

  if (Number.isNaN(hour) || hour > 23 || minute > 59) return raw;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function coerceNumericValue(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return raw;
  const s = raw.trim().toLowerCase();
  if (s === "") return raw;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (s in NUMBER_WORDS) return NUMBER_WORDS[s];
  return raw;
}

function coerceBooleanValue(raw) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return raw;
  const s = raw.trim().toLowerCase();
  if (["true", "yes", "haan", "done", "1"].includes(s)) return true;
  if (["false", "no", "nahi", "missed", "0"].includes(s)) return false;
  return raw;
}

// Defense-in-depth: even though Structured Outputs constrains activity_id to
// an enum we supplied, re-validate + normalize before this ever reaches the
// frontend, so a formatting slip never breaks the widget.
function validateAndNormalizeUpdates(updates, activities) {
  if (!Array.isArray(updates)) return [];
  const byId = new Map(activities.map((a) => [a.activity_id, a]));

  return updates
    .filter((u) => u && typeof u.activity_id === "string" && byId.has(u.activity_id))
    .map((u) => {
      const activity = byId.get(u.activity_id);
      let value = u.value;

      if (activity.type === "time") {
        value = normalizeTimeValue(value);
      } else if (activity.type === "number" || activity.type === "duration") {
        value = coerceNumericValue(value);
      } else if (activity.type === "boolean") {
        value = coerceBooleanValue(value);
      } else if (activity.type === "enum" && Array.isArray(activity.options)) {
        const allowed = new Set(activity.options.map((o) => o.value));
        if (!allowed.has(value)) return null;
      }

      return { activity_id: u.activity_id, value };
    })
    .filter(Boolean);
}

/**
 * interpretWithGpt5Nano(text, context)
 *   context: { activities: ActivityDefinition[], today?: ActivityRecord[] }
 * returns: { intent, updates, confidence?, clarification? }
 */
export const interpretWithGpt5Nano = async (text, context) => {
  const activities = context?.activities || [];
  const activityIds = activities.map((a) => a.activity_id);

  if (activityIds.length === 0) {
    return {
      intent: "unrecognized",
      updates: [],
      confidence: 0,
      clarification: null,
    };
  }

  const openai = getClient();

  const todayDate = context?.todayDate || new Date().toISOString().slice(0, 10);

  const userPrompt = `Today's date is: ${todayDate}

User message: "${text}"

Available activities (only use these activity_id values):
${JSON.stringify(activities, null, 2)}

Today's current state:
${JSON.stringify(context?.today ?? [], null, 2)}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const schema = { type: "json_schema", json_schema: buildResponseSchema(activityIds) };

  let result;
  let lastErr;
  // One retry — a strict-schema call occasionally fails transiently.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        response_format: schema,
      });
      result = JSON.parse(completion.choices[0].message.content);
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[openaiService] interpret attempt ${attempt + 1} failed:`, err?.message || err);
    }
  }

  if (!result) {
    const status = lastErr?.status || "Unknown";
    const message = lastErr?.error?.message || lastErr?.message || "Unknown error";
    throw { errorType: "OPENAI_API_ERROR", status, message };
  }

  if (result.intent === "update_activities") {
    result.updates = validateAndNormalizeUpdates(result.updates, activities);
    if (result.updates.length === 0) {
      result.intent = "unrecognized";
    }
  } else if (!Array.isArray(result.updates)) {
    result.updates = [];
  }

  // Defense-in-depth: only accept a well-formed, non-future ISO date.
  if (result.target_date) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(result.target_date) && result.target_date <= todayDate;
    if (!valid) result.target_date = null;
  }

  return result;
};

/**
 * transcribeAudio(buffer, mimeType)
 * ----------------------------------------------------------------------------
 * Speech-to-text fallback for browsers/webviews (notably iOS Safari/webviews,
 * and any in-app browser) that don't implement the Web Speech API at all —
 * NLInputBar.jsx records short voice notes with MediaRecorder there instead
 * and posts the audio here to be transcribed, so the mic works everywhere,
 * not just on Chrome/Android. Uses the cheap "gpt-4o-mini-transcribe" model
 * by default (override with SADHNA_TRANSCRIBE_MODEL).
 */
const TRANSCRIBE_MODEL = process.env.SADHNA_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

export const transcribeAudio = async (buffer, mimeType = "audio/webm") => {
  const openai = getClient();
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "webm";
  const file = await OpenAI.toFile(buffer, `voice-note.${ext}`, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
  });

  return (transcription?.text || "").trim();
};

export default { interpretWithGpt5Nano, transcribeAudio };
