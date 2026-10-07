/**
 * assistantParser — the chatbot's fast, free first step.
 *
 * Reads one message such as "woke at 4:25, 16 rounds, hearing 1 hour" and
 * works out which of the student's activities it is about and what value each
 * gets. Pure JavaScript (no database, no packages) so it can be tested alone —
 * see tests/assistantParser.test.mjs.
 *
 * parseSadhna(text, activities) returns
 *   {
 *     updates:  [{ activity_id, value }]   best guess
 *     needsAI:  boolean                    true when anything is unclear
 *     reasons:  string[]                   why (for tests and logs)
 *   }
 *
 * The one rule that matters: when in doubt, say needsAI. A message the parser
 * is not completely sure about is handed to the AI step instead of being saved
 * half-understood.
 *
 * How it works, in short:
 *   1. Tidy the text (lower case, number words, "saade char baje" -> 4:30).
 *   2. Cut it into clauses at commas, "and", "aur" ...
 *   3. In each clause find "anchors" (words that name an activity, chosen by
 *      the activity's category and its own name) and "tokens" (times, amounts
 *      with a unit, bare numbers).
 *   4. Give every token to the right anchor. The UNIT decides the kind of
 *      activity (rounds/mala -> chanting count, min/hour -> a duration,
 *      a clock time -> wake-up / sleep / chanting completion).
 *   5. Anything left over (an unused number, an unknown activity, a
 *      correction word ...) sets needsAI.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const LET = "\\p{L}\\p{M}\\p{N}_";
const BEFORE = `(?<![${LET}])`;
const AFTER = `(?![${LET}])`;
const wordRe = (src, flags = "giu") => new RegExp(`${BEFORE}(?:${src})${AFTER}`, flags);

const toAsciiDigits = (s) => s.replace(/[०-९]/g, (ch) => String("०१२३४५६७८९".indexOf(ch)));
const pad2 = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, chhah: 6, che: 6, chhey: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, pachees: 25, tees: 30, chalis: 40,
  paintalis: 45, pachas: 50,
};
const NUM_WORD_SRC = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join("|");

const COUNT_UNIT = "rounds?|malas?|mala|japa|jap|rnd|राउंड|माला";
const MIN_UNIT = "minutes?|mins?|min|mint|मिनट";
const HOUR_UNIT = "hours?|hrs?|hr|ghant[ae]o?n?|ghanta|ghante|ghanton|घंटा|घंटे";
const ANY_UNIT = `${COUNT_UNIT}|${MIN_UNIT}|${HOUR_UNIT}`;

// Words that make a message too tricky for the fast step.
const AI_ONLY_WORDS = wordRe(
  [
    "sorry", "actually", "correction", "instead", "but", "lekin", "magar", "par", "however", "although",
    "remaining", "baki", "baaki", "baaqi", "total", "plus", "rest of", "baad me", "baad mein", "later",
    "make it", "change", "update", "edit", "delete", "remove", "cancel", "undo", "kitne", "kitna", "kitni",
    "how many", "how much", "what", "which", "why", "when", "who", "kya", "kab", "kaise", "kyun", "show",
    "marks", "score", "points", "around", "about", "approx", "approximately", "lagbhag", "kareeb", "shayad",
    "maybe", "roughly", "ya", "or", "each", "both", "total", "also", "bhi", "sab", "sabhi", "everything",
    "all", "same", "wahi", "usi", "waise", "jaise", "again", "dobara", "phir se", "twice", "dono",
    "morning and evening", "subah shaam",
  ].join("|")
);

// Polarity words for yes/no activities and for "did not do it" (value 0).
const NEG_SRC = [
  "not", "no", "nahi", "nahin", "nhi", "nai", "nahee", "never", "didn'?t", "didnt", "did not", "couldn'?t",
  "couldnt", "could not", "can'?t", "cant", "cannot", "haven'?t", "havent", "wasn'?t", "wasnt", "skip(?:ped|ping)?",
  "miss(?:ed|ing)?", "mis", "chhut(?:\\s*gaya|\\s*gayi|\\s*gai)?", "chut(?:\\s*gaya|\\s*gayi|\\s*gai)?",
  "nahi\\s*(?:ho\\s*paya|ho\\s*payi|ho\\s*paayi|kar\\s*paya|kar\\s*paayi|kar\\s*payi)", "नहीं", "नही", "ना",
].join("|");
// "ki" on its own is left out: it also means "of" ("kal ki chanting").
const POS_SRC = [
  "yes", "yeah", "yep", "haan", "han", "ha", "attended", "attend(?:ed)?", "attending", "went", "go(?:ne)?", "gaya", "gayi",
  "done", "did", "hua", "hui", "hue", "ho gaya", "ho gayi", "kiya", "kari", "kar li", "present", "joined",
  "participated", "complete(?:d)?", "हुई", "हुआ", "किया", "गया", "गई", "गयी", "हाँ", "हां",
].join("|");
const NEGATIVE = wordRe(NEG_SRC);
const POSITIVE = wordRe(POS_SRC);
// A no-word followed within two words by a yes-word is ONE negative statement:
// "nahi hua", "did not attend", "mis ho gayi", "nahi gaya".
const NEG_PHRASE = new RegExp(`${BEFORE}(?:${NEG_SRC})(?:\\s+[${LET}']+){0,2}?\\s+(?:${POS_SRC})${AFTER}`, "giu");

// ---------------------------------------------------------------------------
// Activity lexicon — how people refer to each kind of activity.
// `words` are plain words (used to tell a generic name from a specific one);
// `re` is the pattern that finds them in text.
// ---------------------------------------------------------------------------
const LEXICON = {
  chanting: {
    words: ["chanting", "chant", "chanted", "japa", "jap", "mala", "malas", "round", "rounds"],
    re: "chant(?:ing|ed|s)?|japa|jap|malas?|rounds?|जप|माला|चैंटिंग|राउंड",
  },
  chanting_completion_time: {
    words: ["chanting", "chant", "completion", "completed", "complete", "finish", "finished", "japa", "mala", "round", "rounds"],
    re: "complet(?:ion|ed|e)?|finish(?:ed)?|khatam|khatm|poora|pura|purn|पूरा|खत्म",
  },
  hearing: {
    words: ["hearing", "hear", "heard", "listen", "listened", "listening", "suna", "suni", "pravachan", "lecture", "katha", "class", "shravan", "sravan"],
    re: "hear(?:ing|d)?|listen(?:ed|ing)?|sun(?:a|i|aa|ne|na)|pravachan(?:a)?|lectures?|katha|class(?:es)?|shravan(?:a)?|sravan(?:a)?|श्रवण|प्रवचन|सुना|सुनी|कथा",
  },
  reading: {
    words: ["reading", "read", "padha", "padhi", "padhai", "book", "books", "pustak", "granth", "bhagavatam", "bhagwatam", "gita", "geeta"],
    re: "read(?:ing)?|padh(?:a|i|ai|ne|na|e)?|books?|pustak|granth|bhagavatam|bhagwatam|gita|geeta|पढ़ा|पढ़ी|पढ़ाई|पढ़|किताब",
  },
  day_rest: {
    words: ["rest", "nap", "aaram", "araam", "relax", "day", "afternoon", "siesta"],
    re: "rest(?:ed|ing)?|naps?|napped|aaram|araam|siesta|relax(?:ed)?|आराम",
  },
  sleep: {
    words: ["sleep", "slept", "soya", "sone", "bed", "bedtime", "neend"],
    re: "sleep|slept|sleeping|soya|soyi|so\\s*gaya|so\\s*gayi|sone|went\\s+to\\s+bed|bed\\s*time|bedtime|सोया|सोई|सो गया|सो गई",
  },
  wakeup: {
    words: ["wake", "woke", "wakeup", "utha", "uthi", "uthna", "up", "got", "jaga"],
    re: "woke|wake\\s*up|wakeup|wake|waking|got\\s+up|utha|uthi|uthe|uthna|uth\\s*gaya|uth\\s*gayi|jaaga|jaga|उठा|उठी|उठना",
  },
  mangal_aarti: {
    words: ["mangal", "mangala", "aarti", "arti", "aarati", "arati", "aarathi"],
    re: "mangala?\\s*a+r(?:a)?(?:t|th)(?:i|y)?|a+r(?:a)?(?:t|th)(?:i|y)|मंगल\\s*आरती|आरती",
  },
};

// Words in a name that say nothing about WHICH activity it is.
const FILLER_NAME_WORDS = new Set([
  "min", "mins", "minute", "minutes", "time", "hour", "hours", "duration", "attended", "attend", "in", "of", "the",
  "and", "a", "an", "for", "per", "daily", "total", "my", "day", "mins.", "min.", "number", "no", "count",
]);

const nameTokens = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !FILLER_NAME_WORDS.has(t));

// ---------------------------------------------------------------------------
// Step 1 — tidy the text
// ---------------------------------------------------------------------------
function prepare(text) {
  let t = toAsciiDigits(String(text ?? "")).toLowerCase().normalize("NFC");
  t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ");
  t = t.replace(/\b([ap])\.\s?m\.?/g, "$1m"); // a.m. -> am
  t = t.replace(/(\d)\s*([ap])m\b/g, "$1 $2m");

  // "saade char baje" = 4:30, "sawa char baje" = 4:15, "paune char baje" = 3:45
  t = t.replace(
    new RegExp(`${BEFORE}(saade|sade|sadhe|sawa|sava|paune|pona)\\s*(\\d{1,2}|${NUM_WORD_SRC})\\s*baje`, "giu"),
    (_, idiom, h) => {
      let hour = /^\d+$/.test(h) ? parseInt(h, 10) : NUM_WORDS[h];
      let mins = 30;
      if (/^(sawa|sava)$/.test(idiom)) mins = 15;
      if (/^(paune|pona)$/.test(idiom)) { mins = 45; hour = hour === 1 ? 12 : hour - 1; }
      return ` ${hour}:${pad2(mins)} baje`;
    }
  );

  // Fraction words in front of an hour unit: "dedh ghanta" = 1.5 hours.
  const hourUnit = `(?=\\s*(?:${HOUR_UNIT})${AFTER.replace("(?!", "(?!")})`;
  const frac = (words, value) => {
    t = t.replace(new RegExp(`${BEFORE}(?:${words})${hourUnit}`, "giu"), ` ${value} `);
  };
  frac("dedh|derh|डेढ़", "1.5");
  frac("dhai|adhai|ढाई", "2.5");
  frac("sawa|sava|सवा", "1.25");
  frac("aadha|aadhe|adha|adhe|half\\s+an|half\\s+a|half|आधा|आधे", "0.5");

  // Number words in front of a unit or "baje": "solah mala" -> "16 mala".
  t = t.replace(
    new RegExp(`${BEFORE}(${NUM_WORD_SRC})\\s*(?=(?:${ANY_UNIT}|baje)${AFTER})`, "giu"),
    (_, w) => ` ${NUM_WORDS[w.toLowerCase()]} `
  );
  // ...and after a chanting word: "chanting sixteen", "japa solah".
  t = t.replace(
    new RegExp(`(${BEFORE}(?:chanting|chanted|japa|jap)\\s+)(${NUM_WORD_SRC})${AFTER}`, "giu"),
    (_, pre, w) => `${pre}${NUM_WORDS[w.toLowerCase()]}`
  );
  return t.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Step 2 — clauses
// ---------------------------------------------------------------------------
const CLAUSE_SPLIT = new RegExp(
  `(?:,\\s+|,(?=[${LET}])|;|\\n|\\.\\s+|\\.$|\\s+\\+\\s+|${BEFORE}(?:and|aur|phir|then|tatha|evam|also|aur phir|then also)${AFTER})`,
  "giu"
);
function splitClauses(t) {
  const out = [];
  let last = 0;
  for (const m of t.matchAll(CLAUSE_SPLIT)) {
    out.push({ text: t.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  out.push({ text: t.slice(last), start: last });
  return out.filter((c) => c.text.trim());
}

// ---------------------------------------------------------------------------
// Step 3 — tokens inside a clause
// ---------------------------------------------------------------------------
function findTokens(clause) {
  const tokens = [];
  let masked = clause;
  const take = (re, build) => {
    for (const m of [...masked.matchAll(re)]) {
      const tok = build(m);
      if (!tok) continue;
      tok.start = m.index;
      tok.end = m.index + m[0].length;
      tok.raw = m[0];
      tokens.push(tok);
      masked = masked.slice(0, tok.start) + " ".repeat(m[0].length) + masked.slice(tok.end);
    }
  };

  // Clock times. A time like "4.30" followed by a unit word is a decimal amount.
  take(new RegExp(`${BEFORE}(\\d{1,2})[:.](\\d{2})(?!\\d)(?!\\s*(?:${ANY_UNIT})${AFTER})\\s*(am|pm)?(?:\\s*baje)?`, "giu"),
    (m) => ({ kind: "time", hour: +m[1], minute: +m[2], meridiem: m[3] || null }));
  take(new RegExp(`${BEFORE}(\\d{1,2})\\s*(am|pm)${AFTER}(?:\\s*baje)?`, "giu"),
    (m) => ({ kind: "time", hour: +m[1], minute: 0, meridiem: m[2] }));
  take(new RegExp(`${BEFORE}(\\d{1,2})\\s*baje${AFTER}`, "giu"),
    (m) => ({ kind: "time", hour: +m[1], minute: 0, meridiem: null }));

  // Amounts with a unit.
  const num = "(\\d+(?:\\.\\d+)?)";
  take(new RegExp(`${BEFORE}${num}\\s*(?:${COUNT_UNIT})${AFTER}`, "giu"), (m) => ({ kind: "count", value: parseFloat(m[1]) }));
  take(new RegExp(`${BEFORE}${num}\\s*(?:${MIN_UNIT})${AFTER}`, "giu"), (m) => ({ kind: "duration", value: parseFloat(m[1]) }));
  take(new RegExp(`${BEFORE}${num}\\s*(?:${HOUR_UNIT})${AFTER}`, "giu"), (m) => ({ kind: "duration", value: parseFloat(m[1]) * 60 }));

  // Whatever numbers remain are bare. A bare number right after at/by/tak/till
  // is a clock hour ("completed at 9").
  take(new RegExp(`${BEFORE}(\\d+(?:\\.\\d+)?)(?![\\d.]*\\d)${AFTER}`, "giu"), (m) => {
    const before = masked.slice(0, m.index);
    if (/(?:\bat|\bby|\btak|\btill|\bpe|\bpar|@)\s*$/.test(before) && Number.isInteger(parseFloat(m[1])) && +m[1] <= 24) {
      return { kind: "time", hour: +m[1], minute: 0, meridiem: null, bare: true };
    }
    return { kind: "bare", value: parseFloat(m[1]) };
  });

  tokens.sort((a, b) => a.start - b.start);
  return { tokens, rest: masked };
}

// ---------------------------------------------------------------------------
// Step 4 — which activities does the clause mention?
// ---------------------------------------------------------------------------
function buildActivityIndex(activities) {
  return activities.map((a) => {
    const lex = LEXICON[a.category];
    const generic = new Set((lex?.words || []).map((w) => w.toLowerCase()));
    const distinguishing = nameTokens(a.name).filter((t) => !generic.has(t));
    return { ...a, lex, distinguishing };
  });
}

/** Pick, among activities of one category, the one the clause means. */
function chooseAmong(candidates, clause) {
  if (candidates.length === 1) {
    return { act: candidates[0] };
  }
  const hits = candidates
    .map((c) => ({ c, n: c.distinguishing.filter((t) => new RegExp(`${BEFORE}${t}${AFTER}`, "iu").test(clause)).length }))
    .filter((x) => x.n > 0);
  if (hits.length) {
    hits.sort((a, b) => b.n - a.n);
    if (hits.length > 1 && hits[0].n === hits[1].n) return { ambiguous: true };
    return { act: hits[0].c };
  }
  const base = candidates.filter((c) => c.distinguishing.length === 0);
  if (base.length === 1) return { act: base[0] };
  return { ambiguous: true };
}

/** All anchors (positions where a clause names an activity). */
function findAnchors(clause, index) {
  const anchors = [];
  const byCategory = {};
  for (const a of index) (byCategory[a.category] ||= []).push(a);

  const seenCat = new Set();
  const addHits = (category, re) => {
    for (const m of clause.matchAll(wordRe(re))) {
      anchors.push({ category, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  };
  for (const [category, acts] of Object.entries(byCategory)) {
    if (category === "custom") {
      // Custom activities are found by their own name words.
      for (const a of acts) {
        for (const tok of a.distinguishing) {
          for (const m of clause.matchAll(wordRe(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))) {
            anchors.push({ category: "custom", act: a, start: m.index, end: m.index + m[0].length, text: m[0] });
          }
        }
      }
      continue;
    }
    if (!LEXICON[category]) continue;
    if (category === "chanting_completion_time") continue; // handled by the completion cue below
    addHits(category, LEXICON[category].re);
    seenCat.add(category);
  }
  // A specific name word ("srila", "prabhupada", "spiritual", "misc") also
  // anchors its activity — but only when the clause also says the general word
  // ("hearing", "reading" ...), so "srila prabhupada" alone never pulls in a
  // second activity.
  const generalHere = new Set(anchors.filter((x) => !x.specific).map((x) => x.category));
  for (const a of index) {
    if (a.category === "custom" || !generalHere.has(a.category)) continue;
    for (const tok of a.distinguishing) {
      for (const m of clause.matchAll(wordRe(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))) {
        anchors.push({ category: a.category, act: a, start: m.index, end: m.index + m[0].length, text: m[0], specific: true });
      }
    }
  }
  anchors.sort((a, b) => a.start - b.start);
  // Remove an anchor that sits inside another one of the same category.
  return anchors.filter(
    (x, i) => !anchors.some((y, j) => j !== i && y.category === x.category && y.start <= x.start && y.end >= x.end && (y.start < x.start || y.end > x.end))
  );
}

// ---------------------------------------------------------------------------
// Step 5 — time values
// ---------------------------------------------------------------------------
const HINT_PM = wordRe("raat|rat|night|evening|shaam|sham|sandhya|रात|शाम");
const HINT_AM = wordRe("subah|morning|savere|सुबह|सवेरे|early");

function timeValue(tok, category, clause) {
  let { hour, minute, meridiem } = tok;
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  const pmHint = HINT_PM.test(clause);
  const amHint = HINT_AM.test(clause);
  HINT_PM.lastIndex = 0; HINT_AM.lastIndex = 0;
  if (hour >= 13) return `${pad2(hour)}:${pad2(minute)}`; // already 24-hour
  if (category === "wakeup") {
    if (hour === 12 || hour === 0) return null;
    if (pmHint && !amHint) return null; // "raat 10 baje utha" is odd — let the AI look
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  if (category === "sleep") {
    if (amHint && !pmHint) return `${pad2(hour === 12 ? 0 : hour)}:${pad2(minute)}`;
    if (hour >= 7 && hour <= 11) return `${pad2(hour + 12)}:${pad2(minute)}`;
    if (hour === 12) return `00:${pad2(minute)}`;
    if (hour >= 1 && hour <= 6) return `${pad2(hour)}:${pad2(minute)}`;
    return null;
  }
  if (category === "chanting_completion_time") {
    if (pmHint && !amHint && hour <= 11) return `${pad2(hour + 12)}:${pad2(minute)}`;
    if (hour >= 4 && hour <= 11) return `${pad2(hour)}:${pad2(minute)}`;
    if (hour === 12) return `12:${pad2(minute)}`;
    if (hour >= 1 && hour <= 3) return `${pad2(hour + 12)}:${pad2(minute)}`;
    return null;
  }
  return null; // custom time activities: only explicit am/pm or 24-hour
}

// ---------------------------------------------------------------------------
// Step 6 — one clause
// ---------------------------------------------------------------------------
const COMPLETION_CUE = wordRe("complet(?:ed|e|ion)?|finish(?:ed)?|khatam|khatm|poora|pura|purn|ho\\s*gayi|ho\\s*gaya|hui|done|over|पूरा|खत्म");
const HAS_CHANT = wordRe(LEXICON.chanting.re);

function pairInOrder(anchors, tokens) {
  // One-to-one matching in text order: "woke 4:30 slept 10 pm" (anchor first)
  // or "4:30 baje utha 10 baje soya" (token first).
  if (anchors.length !== tokens.length) return null;
  const A = [...anchors].sort((x, y) => x.start - y.start);
  const T = [...tokens].sort((x, y) => x.start - y.start);
  const anchorFirst = A.every((a, i) => a.start < T[i].start && (i + 1 >= A.length || T[i].start < A[i + 1].start));
  const tokenFirst = T.every((t, i) => t.start < A[i].start && (i + 1 >= T.length || A[i].start < T[i + 1].start));
  if (anchorFirst && !tokenFirst) return A.map((a, i) => [a, T[i]]);
  if (tokenFirst && !anchorFirst) return A.map((a, i) => [a, T[i]]);
  return null;
}

function parseClause(clause, index, out) {
  const reasons = out.reasons;
  const { tokens, rest } = findTokens(clause);
  const anchors = findAnchors(clause, index);

  // Resolve anchors to activities, grouped by category.
  const catActs = (category) => index.filter((a) => a.category === category);
  const resolved = []; // { act, anchor }
  const cats = [...new Set(anchors.map((a) => a.category))];
  const resolvedByCat = {};
  for (const category of cats) {
    const group = anchors.filter((a) => a.category === category);
    let acts;
    if (category === "custom") {
      const set = [...new Set(group.map((g) => g.act))];
      if (set.length > 1) { reasons.push("two custom activities in one clause"); out.needsAI = true; continue; }
      acts = set;
    } else {
      const generalActs = catActs(category);
      if (!generalActs.length) continue;
      const choice = chooseAmong(generalActs, clause);
      if (choice.ambiguous) { reasons.push(`several "${category}" activities - cannot tell which`); out.needsAI = true; continue; }
      acts = [choice.act];
    }
    resolvedByCat[category] = acts[0];
    for (const g of group) resolved.push({ act: acts[0], anchor: g });
  }
  const actFor = (category) => resolvedByCat[category];

  // Several words for the same activity ("heard lecture", "read book") are
  // ONE anchor that spans all of them.
  const mergeAnchors = (list) => {
    const byKey = new Map();
    for (const a of list) {
      const key = a.category === "custom" ? `custom:${a.act?.activity_id}` : a.category;
      const cur = byKey.get(key);
      if (!cur) byKey.set(key, { ...a });
      else { cur.start = Math.min(cur.start, a.start); cur.end = Math.max(cur.end, a.end); cur.text = `${cur.text} ${a.text}`; }
    }
    return [...byKey.values()].sort((x, y) => x.start - y.start);
  };

  const used = new Set();
  const setValue = (act, value) => {
    const prev = out.map.get(act.activity_id);
    if (prev !== undefined && prev !== value) {
      reasons.push(`two different values for ${act.name}`);
      out.needsAI = true;
      return;
    }
    out.map.set(act.activity_id, value);
  };

  // ---- time tokens ------------------------------------------------------
  const timeToks = tokens.filter((t) => t.kind === "time");
  const timeAnchors = mergeAnchors([
    ...anchors.filter((x) => x.category === "wakeup" || x.category === "sleep"),
    ...anchors.filter((x) => x.category === "custom" && x.act?.type === "time"),
  ]);

  if (timeToks.length) {
    const chantHere = HAS_CHANT.test(clause) || tokens.some((t) => t.kind === "count");
    HAS_CHANT.lastIndex = 0;
    const completionAct = catActs("chanting_completion_time")[0];
    // Sleep anchors only count as TIME anchors when no duration is attached
    // to them ("din me 1 ghanta soya" is day rest, not a bedtime).
    const durationToks = tokens.filter((t) => t.kind === "duration");
    const usable = timeAnchors.filter((a) => !(a.category === "sleep" && durationToks.length && !timeToks.length));
    if (usable.length) {
      const pairs = pairInOrder(usable, timeToks);
      if (!pairs) {
        reasons.push("times and activities do not line up");
        out.needsAI = true;
      } else {
        for (const [anchor, tok] of pairs) {
          const act = anchor.category === "custom" ? anchor.act : actFor(anchor.category);
          if (!act) { out.needsAI = true; reasons.push("no activity for time"); continue; }
          if (act.type !== "time") { out.needsAI = true; reasons.push("time given to a non-time activity"); continue; }
          const v = timeValue(tok, act.category, clause);
          if (v === null) { out.needsAI = true; reasons.push(`unclear time "${tok.raw}"`); continue; }
          setValue(act, v);
          used.add(tok);
        }
      }
    } else if (chantHere && completionAct && timeToks.length === 1) {
      const v = timeValue(timeToks[0], "chanting_completion_time", clause);
      if (v === null || completionAct.type !== "time") { out.needsAI = true; reasons.push("unclear completion time"); }
      else { setValue(completionAct, v); used.add(timeToks[0]); }
    }
    // A completion cue together with chanting words and a time, even when a
    // wake/sleep word is in the clause ("woke at 5 chanting completed at 9")
    // is split by the clause cutter, so nothing more to do here.
  }

  // ---- count tokens (rounds / mala) -> chanting count ------------------
  const countToks = tokens.filter((t) => t.kind === "count");
  const chantAct = catActs("chanting").find((a) => a.type === "number");
  if (countToks.length) {
    if (!chantAct) { out.needsAI = true; reasons.push("rounds given but no chanting count activity"); }
    else if (countToks.length > 1) { out.needsAI = true; reasons.push("more than one count in a clause"); }
    else {
      const v = countToks[0].value;
      if (!Number.isInteger(v) || v < 0 || v > 64) { out.needsAI = true; reasons.push(`unusual number of rounds ${v}`); }
      else { setValue(chantAct, v); used.add(countToks[0]); }
    }
  }

  // ---- duration tokens -> hearing / reading / day rest / custom ---------
  const durToks = tokens.filter((t) => t.kind === "duration");
  const durAnchors = mergeAnchors(anchors.filter((a) => ["hearing", "reading", "day_rest"].includes(a.category) || (a.category === "custom" && a.act?.type === "duration")));
  // "soya" with a duration means day rest.
  const soyaAsRest = anchors.filter((a) => a.category === "sleep" && durToks.length && !timeToks.length);
  soyaAsRest.forEach((a) => { a.asRest = true; });
  const durationAnchors = [...durAnchors];
  const restAct = catActs("day_rest")[0];
  if (soyaAsRest.length && restAct && !durAnchors.some((a) => a.category === "day_rest")) {
    const merged = mergeAnchors([...durationAnchors, ...soyaAsRest.map((a) => ({ ...a, category: "day_rest" }))]);
    durationAnchors.length = 0;
    durationAnchors.push(...merged);
    resolvedByCat.day_rest = restAct;
  }
  if (durToks.length) {
    if (!durationAnchors.length) { out.needsAI = true; reasons.push("a duration with no activity named"); }
    else {
      const pairs = durationAnchors.length === 1 && durToks.length === 1
        ? [[durationAnchors[0], durToks[0]]]
        : pairInOrder(durationAnchors, durToks);
      if (!pairs) { out.needsAI = true; reasons.push("durations and activities do not line up"); }
      else {
        for (const [anchor, tok] of pairs) {
          const act = anchor.category === "custom" ? anchor.act : (resolvedByCat[anchor.category] || actFor(anchor.category));
          if (!act || act.type !== "duration") { out.needsAI = true; reasons.push("duration for a non-duration activity"); continue; }
          if (tok.value < 0 || tok.value > 720) { out.needsAI = true; reasons.push("unusual duration"); continue; }
          setValue(act, Math.round(tok.value * 100) / 100);
          used.add(tok);
        }
      }
    }
  }

  // ---- a no-word together with an amount in one clause is unclear ---------
  // ("reading nahi kiya 99", "no chanting 16") — the AI decides.
  const negHere = NEGATIVE.test(rest) || NEG_PHRASE.test(rest);
  NEGATIVE.lastIndex = 0; NEG_PHRASE.lastIndex = 0;
  const hasAmount = tokens.some((t) => ["count", "duration", "bare"].includes(t.kind));
  const boolOnly = anchors.length > 0 && anchors.every((a) => a.category === "mangal_aarti");
  if (negHere && hasAmount && !boolOnly) {
    out.needsAI = true;
    reasons.push("a no-word together with an amount");
  }

  // ---- bare numbers ---------------------------------------------------------
  const bareToks = tokens.filter((t) => t.kind === "bare");
  if (bareToks.length && !(negHere && !boolOnly)) {
    const numAnchors = anchors.filter((a) => a.category === "chanting");
    const dAnchors = durationAnchors;
    const free = numAnchors.length + dAnchors.length;
    const othersUsed = tokens.filter((t) => t.kind !== "bare").length;
    if (bareToks.length === 1 && free === 1 && !othersUsed) {
      const tok = bareToks[0];
      if (numAnchors.length === 1 && chantAct) {
        if (Number.isInteger(tok.value) && tok.value >= 0 && tok.value <= 64) { setValue(chantAct, tok.value); used.add(tok); }
        else { out.needsAI = true; reasons.push("unusual number of rounds"); }
      } else if (dAnchors.length === 1) {
        const anchor = dAnchors[0];
        const act = anchor.category === "custom" ? anchor.act : resolvedByCat[anchor.category];
        if (act && act.type === "duration" && tok.value >= 0 && tok.value <= 720) { setValue(act, tok.value); used.add(tok); }
        else { out.needsAI = true; reasons.push("unclear bare number"); }
      }
    }
  }

  // ---- yes / no activities ---------------------------------------------------
  const boolAnchors = anchors.filter((a) => a.category === "mangal_aarti" || (a.category === "custom" && a.act?.type === "boolean"));
  const handledBool = new Set();
  if (boolAnchors.length) {
    const acts = [...new Set(boolAnchors.map((a) => (a.category === "custom" ? a.act : actFor(a.category))))].filter(Boolean);
    if (acts.length !== 1) { out.needsAI = true; reasons.push("several yes/no activities in one clause"); }
    else if (acts[0].type !== "boolean") { out.needsAI = true; reasons.push("yes/no words for a non-yes/no activity"); }
    else {
      const text = rest; // quantities removed
      // "nahi hua", "did not attend", "mis ho gayi", "nahi gaya": a no-word
      // followed within two words by a yes-word is ONE negative statement.
      const stripped = text.replace(NEG_PHRASE, " NEGPHRASE ");
      const hadPhrase = stripped.includes("NEGPHRASE");
      const cleanedText = stripped.replace(/NEGPHRASE/g, " ");
      const neg = hadPhrase || NEGATIVE.test(cleanedText); NEGATIVE.lastIndex = 0;
      const pos = POSITIVE.test(cleanedText); POSITIVE.lastIndex = 0;
      if (neg && pos) { out.needsAI = true; reasons.push("mixed yes and no words"); }
      else if (neg) { setValue(acts[0], false); handledBool.add(acts[0]); }
      else if (pos) { setValue(acts[0], true); handledBool.add(acts[0]); }
      else { out.needsAI = true; reasons.push("yes/no activity with no yes or no"); }
    }
  }

  // ---- "did not do it" for counts and durations -> 0 ---------------------
  const valueAnchors = anchors.filter((a) => ["chanting", "hearing", "reading", "day_rest"].includes(a.category) || (a.category === "custom" && ["duration", "number"].includes(a.act?.type)));
  const hasQuantity = tokens.some((t) => ["count", "duration", "bare"].includes(t.kind));
  const clauseNegative = NEGATIVE.test(rest); NEGATIVE.lastIndex = 0;
  if (valueAnchors.length && !hasQuantity && clauseNegative) {
    const cats2 = [...new Set(valueAnchors.map((a) => a.category))];
    for (const c of cats2) {
      const act = c === "chanting" ? chantAct : (c === "custom" ? valueAnchors.find((a) => a.category === "custom").act : actFor(c));
      if (!act || !["number", "duration"].includes(act.type)) { out.needsAI = true; reasons.push("zero for an unsupported activity"); continue; }
      setValue(act, 0);
      handledBool.add(act);
    }
  }

  // ---- everything must be accounted for ----------------------------------
  for (const t of tokens) {
    if (!used.has(t)) {
      out.needsAI = true;
      reasons.push(`number "${t.raw.trim()}" not used`);
    }
  }
  // An anchor with no value at all (e.g. "reading" alone, "chanting" alone).
  for (const { act, anchor } of resolved) {
    if (anchor.asRest) continue;
    const has = out.map.has(act.activity_id);
    const family = anchor.category === "chanting" && out.map.has(catActs("chanting_completion_time")[0]?.activity_id);
    if (!has && !family && !handledBool.has(act)) {
      // Words like "chanting" alone inside "chanting completed at 9" belong to the completion time.
      if (anchor.category === "chanting" && catActs("chanting_completion_time")[0] && out.map.has(catActs("chanting_completion_time")[0].activity_id)) continue;
      // "sleep"/"slept" with the time already taken by another activity — not applicable here.
      out.needsAI = true;
      reasons.push(`"${anchor.text}" has no value`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
export function parseSadhna(text, activities) {
  const out = { map: new Map(), needsAI: false, reasons: [] };
  const raw = String(text ?? "");

  if (!raw.trim()) return { updates: [], needsAI: false, reasons: ["empty"] };
  if (raw.length > 600) return { updates: [], needsAI: true, reasons: ["message too long for the fast step"] };

  const t = prepare(raw);
  const index = buildActivityIndex(activities || []);

  if (AI_ONLY_WORDS.test(t)) { out.needsAI = true; out.reasons.push("correction / question / hedge word"); }
  AI_ONLY_WORDS.lastIndex = 0;
  if (/\d\s*[-–]\s*\d/.test(t)) { out.needsAI = true; out.reasons.push("a range of numbers"); }
  if (/\d,\d/.test(t)) { out.needsAI = true; out.reasons.push("comma inside a number"); }
  if (/\?/.test(t)) { out.needsAI = true; out.reasons.push("a question"); }
  if (/[-−]\s*\d/.test(t) && !/\d\s*[-–]\s*\d/.test(t)) { out.needsAI = true; out.reasons.push("negative number"); }

  for (const c of splitClauses(t)) parseClause(c.text, index, out);

  const updates = [...out.map.entries()].map(([activity_id, value]) => ({ activity_id, value }));
  if (!updates.length) return { updates, needsAI: out.needsAI, reasons: out.reasons };
  return { updates, needsAI: out.needsAI, reasons: out.reasons };
}

/**
 * Same shape the controller has always used: { intent, updates, confidence }.
 * Anything the parser is unsure about comes back as "unrecognized" so that the
 * AI step (or the user) gets to look at it.
 */
export function interpretLocally(text, activities) {
  const r = parseSadhna(text, activities);
  if (r.needsAI || !r.updates.length) return { intent: "unrecognized", updates: [], reasons: r.reasons };
  return { intent: "update_activities", updates: r.updates, confidence: 0.9, reasons: r.reasons };
}
