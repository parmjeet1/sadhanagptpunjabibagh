/**
 * assistantMissing.js — "you don't have that activity" check for the chatbot.
 *
 * When the fast reader cannot save a message, one common reason is that the
 * student simply does not HAVE the activity (for example "study 25 minute"
 * when their list has no Study activity). Sending that to OpenAI is slow and
 * can never save anything, so we say so directly — but only when we are sure.
 *
 * How we are sure: the message is read again with a pretend list = the
 * student's real activities + one pretend activity for each kind they do not
 * have. Only if that pretend reading understands the WHOLE message (nothing
 * left over, nothing unclear) do we conclude "this is about an activity you
 * don't have". Anything less sure goes to the AI step as before.
 */
import { parseSadhna } from "./assistantParser.js";

// One entry per kind of activity the chatbot knows. `have` is a safety net: a
// student whose activity NAME looks like this kind is never told it is missing,
// even if its category was guessed differently.
const KINDS = [
  { key: "chanting", label: "Chanting (rounds)", name: "Chanting", category: "chanting", type: "number", have: /chant|japa|\bjap\b|round|mala/i },
  { key: "chanting_completion_time", label: "Chanting Completion Time", name: "Chanting Completion Time", category: "chanting_completion_time", type: "time", have: /complet|finish|khatam|\bend/i },
  { key: "wakeup", label: "Wake Up Time", name: "Wake Up Time", category: "wakeup", type: "time", have: /wake|\buth|jag|rising|\brise/i },
  { key: "sleep", label: "Sleep Time", name: "Sleep Time", category: "sleep", type: "time", have: /sleep|neend|bed\s*time|\bsone|soya/i },
  { key: "hearing", label: "Hearing", name: "Hearing(MIN)", category: "hearing", type: "duration", have: /hear|lectur|class|sravan|shravan|pravachan|katha|\bsun/i },
  { key: "reading", label: "Reading", name: "Reading(MIN)", category: "reading", type: "duration", have: /read|padh|book|pustak|granth/i },
  { key: "day_rest", label: "Day Rest", name: "Day Rest(MIN)", category: "day_rest", type: "duration", have: /rest|\bnap\b|aaram|vishram/i },
  { key: "mangal_aarti", label: "Mangal Aarti", name: "Mangal Aarti Attended", category: "mangal_aarti", type: "boolean", have: /aarti|arti\b|arati|mangal/i },
  { key: "study", label: "Study", name: "Study (MIN)", category: "custom", type: "duration", have: /study|studies|adhyayan|अध्ययन|स्टडी/i },
  { key: "menial", label: "Menial Service (seva)", name: "Menial Service(MIN)", category: "custom", type: "duration", have: /menial|seva|sewa|service|सेवा/i },
  { key: "shloka", label: "Shloka Memorisation", name: "Shloka Memorisation", category: "custom", type: "duration", have: /shlok|slok|memori|verse|श्लोक/i },
  { key: "distribution", label: "Book Distribution", name: "Book Distribution", category: "custom", type: "number", have: /distribut|sankirtan|vitran|vitaran|book\s*dist/i },
];

const PREFIX = "__missing__";

function hasKind(kind, activities) {
  return activities.some((a) => {
    if (kind.category !== "custom" && a.category === kind.category) return true;
    return kind.have.test(String(a.name || ""));
  });
}

/**
 * Returns null when we are not sure (send the message on to the AI step), or
 *   { missing: ["Study", ...], updates: [...] }
 * where `updates` are the parts that belong to activities the student HAS
 * (empty when the whole message was about activities they do not have).
 */
export function checkMissingActivities(text, activities) {
  if (!Array.isArray(activities)) return null;
  const missingKinds = KINDS.filter((k) => !hasKind(k, activities));
  if (missingKinds.length === 0) return null;

  const pretend = missingKinds.map((k) => ({
    activity_id: `${PREFIX}${k.key}`,
    name: k.name,
    type: k.type,
    category: k.category,
  }));
  const r = parseSadhna(text, [...activities, ...pretend]);
  if (r.needsAI || !r.updates.length) return null;

  const hitIds = new Set(r.updates.filter((u) => String(u.activity_id).startsWith(PREFIX)).map((u) => String(u.activity_id)));
  if (hitIds.size === 0) return null;

  const missing = missingKinds.filter((k) => hitIds.has(`${PREFIX}${k.key}`)).map((k) => k.label);
  const updates = r.updates.filter((u) => !String(u.activity_id).startsWith(PREFIX));
  return { missing, updates };
}

/** The sentence shown to the student. */
export function missingActivityMessage(missing, activities) {
  const names = missing.join(", ");
  const own = activities.map((a) => a.name).filter(Boolean).join(", ");
  return (
    `I understood this as ${names}, but it isn't in your sadhana list, so I can't save it.` +
    (own ? ` Your activities: ${own}.` : "") +
    " If you think I got this wrong, tap “Ask AI to re-check”."
  );
}
