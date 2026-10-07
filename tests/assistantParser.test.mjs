// Run with:  node --test "tests/*.test.mjs"   (no packages to install)
import test from "node:test";
import assert from "node:assert/strict";
import { parseSadhna, interpretLocally } from "../utils/assistantParser.js";
import { analyzeDatePhrase } from "../utils/assistantDate.js";
import { build, ACTS } from "./helpers/sentenceGenerator.mjs";
import { NICKNAMES, OTHER_AARTI_WORDS } from "../utils/assistantLexicon.js";

const NOW = new Date("2026-10-07T10:00:00+05:30");
const mk = (id, name, type, category) => ({ activity_id: String(id), name, type, category });

// The activity names real students have.
const SETS = {
  typical: [
    mk(1, "Chanting", "number", "chanting"), mk(2, "Reading(MIN)", "duration", "reading"),
    mk(3, "Wake Up Time", "time", "wakeup"), mk(4, "Sleep Time", "time", "sleep"),
    mk(5, "Study Hours(MIN)", "duration", "custom"), mk(6, "Day Rest(MIN)", "duration", "day_rest"),
    mk(7, "Hearing(MIN)", "duration", "hearing"), mk(10, "Chanting Completion Time", "time", "chanting_completion_time"),
    mk(11, "Mangal Aarti Attended", "boolean", "mangal_aarti"),
  ],
  many: [
    mk(1, "Chanting", "number", "chanting"), mk(2, "Reading Srila Prabhupada Book", "duration", "reading"),
    mk(3, "Wake Up Time", "time", "wakeup"), mk(4, "Sleep Time", "time", "sleep"),
    mk(7, "Hearing Spiritual Master", "duration", "hearing"), mk(8, "Hearing Srila Prabhupada", "duration", "hearing"),
    mk(9, "Hearing(MIN)", "duration", "hearing"), mk(10, "Chanting Completion Time", "time", "chanting_completion_time"),
    mk(11, "Mangal Aarti Attended", "boolean", "mangal_aarti"), mk(12, "Reading Misc. Books", "duration", "reading"),
    mk(13, "Menial Services", "duration", "custom"), mk(14, "Shloka Memorisation", "duration", "custom"),
  ],
  odd: [mk(1, "Chanting", "boolean", "chanting"), mk(2, "Day Rest (in hours)", "number", "day_rest"), mk(3, "Hearing", "time", "hearing")],
};

/** Runs a sentence the way the chatbot does and returns "AI" or {name: value}. */
function run(set, text) {
  const d = analyzeDatePhrase(text, NOW);
  if (d.ambiguous) return "AI";
  const acts = SETS[set];
  const r = parseSadhna(d.cleaned, acts);
  if (r.needsAI || !r.updates.length) return "AI";
  const byId = Object.fromEntries(acts.map((a) => [a.activity_id, a.name]));
  return Object.fromEntries(r.updates.map((u) => [byId[u.activity_id], u.value]));
}

// [set, sentence, expected]  expected = "AI" (must go to the AI step) or {activity name: value}
const T = "typical";
const H = "Hearing(MIN)", R = "Reading(MIN)", D = "Day Rest(MIN)", WK = "Wake Up Time", SL = "Sleep Time", CH = "Chanting", CT = "Chanting Completion Time", MA = "Mangal Aarti Attended";
const rows = [
  // ---- the activity is found by meaning, not by its exact name
  [T, "hearing 30 min", { [H]: 30 }], [T, "reading 20 min", { [R]: 20 }], [T, "day rest 30 min", { [D]: 30 }],
  [T, "study 45 min", { "Study Hours(MIN)": 45 }], [T, "study hours 45", { "Study Hours(MIN)": 45 }], [T, "hearing 30", { [H]: 30 }],
  [T, "pravachan 45 min suna", { [H]: 45 }], [T, "lecture 20 min", { [H]: 20 }], [T, "2 ghante padha", { [R]: 120 }], [T, "reading 40 min ki", { [R]: 40 }],
  // ---- hours and fractions become minutes
  [T, "1 ghanta hearing", { [H]: 60 }], [T, "dedh ghanta hearing", { [H]: 90 }], [T, "aadha ghanta hearing", { [H]: 30 }],
  [T, "half an hour reading", { [R]: 30 }], [T, "1.5 hours reading", { [R]: 90 }], [T, "reading 1 hour", { [R]: 60 }], [T, "hearing 2 hrs", { [H]: 120 }],
  // ---- day rest versus sleep
  [T, "din me 1 ghanta soya", { [D]: 60 }], [T, "dopahar me aadha ghanta soya", { [D]: 30 }], [T, "slept for 1 hour in the day", { [D]: 60 }],
  [T, "din me 1 ghanta soya aur raat 10 baje soya", { [D]: 60, [SL]: "22:00" }],
  // ---- yes / no
  [T, "did not attend mangal aarti", { [MA]: false }], [T, "didn't attend mangal aarti", { [MA]: false }], [T, "mangal aarti nhi kiya", { [MA]: false }],
  [T, "mangal aarti nahi hua", { [MA]: false }], [T, "mangal arti mis ho gayi", { [MA]: false }], [T, "missed mangal aarti", { [MA]: false }],
  [T, "skipped mangal aarti", { [MA]: false }], [T, "mangal aarti no", { [MA]: false }], [T, "mangal aarti nahi ho paayi", { [MA]: false }],
  [T, "attended mangal aarti", { [MA]: true }], [T, "mangal aarti hua", { [MA]: true }], [T, "mangal aarti attend ki", { [MA]: true }],
  [T, "went to mangal aarti", { [MA]: true }], [T, "mangal aarti yes", { [MA]: true }], [T, "mangal aarti", "AI"], [T, "yes", "AI"],
  // ---- chanting
  [T, "16 rounds chanting", { [CH]: 16 }], [T, "chanting 16", { [CH]: 16 }], [T, "14 mala", { [CH]: 14 }], [T, "japa 14", { [CH]: 14 }],
  [T, "14 round kiya", { [CH]: 14 }], [T, "solah mala", { [CH]: 16 }], [T, "sixteen rounds chanting", { [CH]: 16 }], [T, "chanting sixteen", { [CH]: 16 }],
  [T, "chanting 0", { [CH]: 0 }], [T, "chanting\n16", { [CH]: 16 }], [T, "CHANTING 16 ROUNDS", { [CH]: 16 }], [T, "chanting 016", { [CH]: 16 }],
  [T, "aaj chanting nahi hui", { [CH]: 0 }], [T, "no chanting today", { [CH]: 0 }], [T, "didn't chant today", { [CH]: 0 }], [T, "kal reading nahi kiya", { [R]: 0 }],
  [T, "could not do reading", { [R]: 0 }],
  // ---- clock times
  [T, "woke up at 4:25", { [WK]: "04:25" }], [T, "woke at 5 am", { [WK]: "05:00" }], [T, "got up at 5:15 am", { [WK]: "05:15" }],
  [T, "woke at 4:30AM", { [WK]: "04:30" }], [T, "woke at 4:30 A.M.", { [WK]: "04:30" }], [T, "utha 4 baje", { [WK]: "04:00" }],
  [T, "subah 4:30 baje utha", { [WK]: "04:30" }], [T, "4:30 pe utha", { [WK]: "04:30" }],
  [T, "saade chaar baje utha", { [WK]: "04:30" }], [T, "sawa paanch baje utha", { [WK]: "05:15" }], [T, "paune paanch baje utha", { [WK]: "04:45" }],
  [T, "slept at 10 pm", { [SL]: "22:00" }], [T, "went to bed at 11:30 pm", { [SL]: "23:30" }], [T, "raat 10 baje soya", { [SL]: "22:00" }],
  [T, "10 baje so gaya", { [SL]: "22:00" }], [T, "1 baje soya", { [SL]: "01:00" }], [T, "slept at 1 am", { [SL]: "01:00" }], [T, "slept at 12", { [SL]: "00:00" }],
  [T, "chanting completed at 9:30 am", { [CT]: "09:30" }], [T, "finished chanting at 6", { [CT]: "06:00" }], [T, "chanting 9 baje khatam hua", { [CT]: "09:00" }],
  [T, "chanting completed at 9", { [CT]: "09:00" }],
  [T, "16 rounds chanting at 9 am", { [CH]: 16, [CT]: "09:00" }], [T, "16 mala 9 baje tak ho gayi", { [CH]: 16, [CT]: "09:00" }],
  // ---- several things in one message: each number goes to its own activity
  [T, "16 rounds, 30 min hearing, woke at 4:25", { [CH]: 16, [H]: 30, [WK]: "04:25" }],
  [T, "woke at 4:25, chanting 16, hearing 30 min, reading 20 min", { [WK]: "04:25", [CH]: 16, [H]: 30, [R]: 20 }],
  [T, "aaj ka sadhana ho gaya 16 round 4:30 uthna 30 min hearing", { [CH]: 16, [WK]: "04:30", [H]: 30 }],
  [T, "wake up 4:10, slept at 9 pm", { [WK]: "04:10", [SL]: "21:00" }],
  [T, "chanting completed at 7:30 am and woke at 3:10 am", { [CT]: "07:30", [WK]: "03:10" }],
  [T, "reading 90 min aur chanting 6:30 baje khatam hua", { [R]: 90, [CT]: "06:30" }],
  [T, "4:30 baje utha aur 10 baje soya", { [WK]: "04:30", [SL]: "22:00" }],
  [T, "hearing 30 min and attended mangal aarti", { [H]: 30, [MA]: true }],
  [T, "chanting 16 rounds and reading 20 min", { [CH]: 16, [R]: 20 }],
  [T, "3 days ago chanting completed at 8:30 am", { [CT]: "08:30" }],
  [T, "kal chanting 16 mala", { [CH]: 16 }], [T, "parso 14 mala", { [CH]: 14 }],
  // ---- activities with similar names
  ["many", "hearing 30 min", { [H]: 30 }], ["many", "hearing srila prabhupada 30 min", { "Hearing Srila Prabhupada": 30 }],
  ["many", "30 min hearing srila prabhupada", { "Hearing Srila Prabhupada": 30 }], ["many", "hearing spiritual master 20 min", { "Hearing Spiritual Master": 20 }],
  ["many", "reading srila prabhupada book 20 min", { "Reading Srila Prabhupada Book": 20 }], ["many", "reading misc books 15 min", { "Reading Misc. Books": 15 }],
  ["many", "menial services 30 min", { "Menial Services": 30 }], ["many", "shloka memorisation 20 min", { "Shloka Memorisation": 20 }],
  ["many", "reading 20 min", "AI"], ["many", "book 20 min", "AI"],
  // ---- must go to the AI step (unclear, wrong type, or not a log)
  [T, "chanting 16.5", "AI"], [T, "chanting 200 rounds", "AI"], [T, "chanting -5", "AI"], [T, "chanting 1,6", "AI"], [T, "chanting 12 or 16", "AI"],
  [T, "chanting 12-16 rounds", "AI"], [T, "woke at 4:30 and 5:30", "AI"], [T, "woke 430", "AI"], [T, "woke at 12", "AI"], [T, "reading nahi kiya 99", "AI"],
  [T, "sorry kal nahi kar paya, aaj 16 round chanting", "AI"], [T, "actually make it 14 rounds", "AI"], [T, "correction chanting 15 not 16", "AI"],
  [T, "12 rounds in the morning and remaining 4 later", "AI"], [T, "chanting 16 rounds, 10 before 7 am", "AI"], [T, "reading 20 hearing 30", "AI"],
  [T, "hello", "AI"], [T, "thanks", "AI"], [T, "what are my marks today", "AI"], [T, "16", "AI"], [T, "4:30", "AI"], [T, "chanting", "AI"], [T, "reading", "AI"],
  [T, "how many rounds should I chant", "AI"], [T, "delete my chanting", "AI"], [T, "aaj kitne marks mile", "AI"],
  ["odd", "chanting 16", "AI"], ["odd", "day rest 2 hours", "AI"], ["odd", "hearing 30 min", "AI"], ["odd", "chanting yes", "AI"],
];
for (const [set, text, want] of rows) {
  test(`${set}: ${JSON.stringify(text)} -> ${want === "AI" ? "AI step" : JSON.stringify(want)}`, () => assert.deepEqual(run(set, text), want));
}

// ---------------------------------------------------------------------------
// Nicknames: every word in utils/assistantLexicon.js must work on its own
// ---------------------------------------------------------------------------
const NICK_TEMPLATES = {
  chanting: [(p) => `${p} 16`, { Chanting: 16 }],
  hearing: [(p) => `${p} 30 min`, { [H]: 30 }],
  reading: [(p) => `${p} 20 min`, { [R]: 20 }],
  day_rest: [(p) => `${p} 30 min`, { [D]: 30 }],
  sleep: [(p) => `${p} 10 pm`, { [SL]: "22:00" }],
  wakeup: [(p) => `${p} 4:30`, { [WK]: "04:30" }],
};
for (const [category, [sentence, want]] of Object.entries(NICK_TEMPLATES)) {
  test(`every ${category} nickname is understood (${NICKNAMES[category].phrases.length} words)`, () => {
    const failures = [];
    for (const phrase of NICKNAMES[category].phrases) {
      const got = run(T, sentence(phrase));
      if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${sentence(phrase)} -> ${JSON.stringify(got)}`);
    }
    assert.deepEqual(failures, []);
  });
}
test("every Mangal Aarti nickname is understood", () => {
  const failures = [];
  for (const phrase of NICKNAMES.mangal_aarti.phrases) {
    const got = run(T, `${phrase} attended`);
    if (JSON.stringify(got) !== JSON.stringify({ [MA]: true })) failures.push(phrase);
  }
  for (const phrase of ["mangal aarti", "mangla aarti", "mangal arti", "mangal arati", "mangala arati", "mangala aratik", "mangal aarthi", "mangal-aarti", "manglaarti", "aarti", "arti", "arati", "आरती", "मंगल आरती"]) {
    const got = run(T, `${phrase} attended`);
    if (JSON.stringify(got) !== JSON.stringify({ [MA]: true })) failures.push(phrase);
  }
  assert.deepEqual(failures, []);
});
test("no nickname belongs to two kinds of activity", () => {
  const seen = {};
  for (const [category, entry] of Object.entries(NICKNAMES)) for (const p of entry.phrases || []) (seen[p] ||= []).push(category);
  assert.deepEqual(Object.entries(seen).filter(([, v]) => v.length > 1), []);
});
test("other aartis are never taken for Mangal Aarti", () => {
  for (const word of OTHER_AARTI_WORDS.filter((w) => /^[a-z ]+$/.test(w))) {
    assert.equal(run(T, `${word} aarti attended`), "AI", word);
  }
});

const nickRows = [
  [T, "harinam 16 round", { [CH]: 16 }], [T, "hari naam 16 mala", { [CH]: 16 }], [T, "16 maala", { [CH]: 16 }], [T, "महामंत्र 16 माला", { [CH]: 16 }],
  [T, "mantra jap 12 rounds", { [CH]: 12 }], [T, "16 jaap", { [CH]: 16 }], [T, "16 rd", { [CH]: 16 }], [T, "round 16", { [CH]: 16 }],
  [T, "sb 30 min", { [R]: 30 }], [T, "bhagavatam 30 min padha", { [R]: 30 }], [T, "bg 20 min", { [R]: 20 }], [T, "srimad bhagavatam 45 min", { [R]: 45 }],
  [T, "swadhyay 20 min", { [R]: 20 }], [T, "स्वाध्याय 20 मिनट", { [R]: 20 }], [T, "पढ़ाई 1 घंटा", { [R]: 60 }], [T, "दो घंटे पढ़ाई", { [R]: 120 }],
  [T, "gita class 30 min", { [H]: 30 }], [T, "sb class 45 min suna", { [H]: 45 }], [T, "satsang 60 min", { [H]: 60 }], [T, "katha 1 ghanta suna", { [H]: 60 }],
  [T, "श्रवण 30 मिनट", { [H]: 30 }], [T, "डेढ़ घंटा श्रवण", { [H]: 90 }], [T, "आधा घंटा सुना", { [H]: 30 }], [T, "ek ghanta suna", { [H]: 60 }],
  [T, "2 ghantey padha", { [R]: 120 }], [T, "1 ghnta hearing", { [H]: 60 }], [T, "30 minat suna", { [H]: 30 }], [T, "20 minit padha", { [R]: 20 }],
  [T, "10 mins hearing", { [H]: 10 }], [T, "hearing 2 hrs.", { [H]: 120 }],
  [T, "power nap 20 min", { [D]: 20 }], [T, "siesta 30 min", { [D]: 30 }], [T, "aaram kiya 30 min", { [D]: 30 }], [T, "vishram 20 min", { [D]: 20 }],
  [T, "दोपहर की नींद 30 मिनट", { [D]: 30 }], [T, "afternoon nap 25 min", { [D]: 25 }], [T, "din ki neend 30 min", { [D]: 30 }],
  [T, "lights off at 10 pm", { [SL]: "22:00" }], [T, "so gaye 10 baje", { [SL]: "22:00" }], [T, "10 बजे सोया", { [SL]: "22:00" }],
  [T, "रात 10 बजे सोया", { [SL]: "22:00" }], [T, "neend 10 baje", { [SL]: "22:00" }], [T, "sone gaya 10 baje", { [SL]: "22:00" }],
  [T, "woke-up 4:30", { [WK]: "04:30" }], [T, "wokeup 4:30", { [WK]: "04:30" }], [T, "4:30 uth gya", { [WK]: "04:30" }], [T, "4 baje jaaga", { [WK]: "04:00" }],
  [T, "साढ़े चार बजे उठा", { [WK]: "04:30" }], [T, "सवा पाँच बजे उठा", { [WK]: "05:15" }], [T, "पौने पाँच बजे उठा", { [WK]: "04:45" }],
  [T, "आँख खुली 4:30", { [WK]: "04:30" }], [T, "neend khuli 4:30", { [WK]: "04:30" }], [T, "4:30 बजे उठा", { [WK]: "04:30" }], [T, "5 bje utha", { [WK]: "05:00" }],
  [T, "woke at 4:30 and rounds done by 9", { [WK]: "04:30", [CT]: "09:00" }],
  [T, "सोलह माला", { [CH]: 16 }],
  [T, "mangla aarti attended", { [MA]: true }], [T, "mangal arati hua", { [MA]: true }], [T, "mangala aratik nahi hua", { [MA]: false }],
  [T, "aarti attended", { [MA]: true }], [T, "मंगल आरती हुई", { [MA]: true }], [T, "आरती नहीं हुई", { [MA]: false }],
  [T, "sandhya aarti attended", "AI"], [T, "gaur aarti hua", "AI"], [T, "rest of the day was good", "AI"],
];
for (const [set, text, want] of nickRows) {
  test(`nickname: ${JSON.stringify(text)} -> ${want === "AI" ? "AI step" : JSON.stringify(want)}`, () => assert.deepEqual(run(set, text), want));
}

test("a message with no activities and no text", () => {
  assert.deepEqual(parseSadhna("", SETS.typical).updates, []);
  assert.deepEqual(parseSadhna(null, SETS.typical).updates, []);
  assert.deepEqual(parseSadhna("chanting 16", []).updates, []);
});
test("interpretLocally keeps the shape the controller expects", () => {
  const ok = interpretLocally("chanting 16", SETS.typical);
  assert.equal(ok.intent, "update_activities");
  assert.deepEqual(ok.updates, [{ activity_id: "1", value: 16 }]);
  const no = interpretLocally("actually make it 14 rounds", SETS.typical);
  assert.equal(no.intent, "unrecognized");
  assert.deepEqual(no.updates, []);
});
test("a message over 600 characters goes to the AI step", () => {
  assert.equal(parseSadhna("chanting 16 ".repeat(100), SETS.typical).needsAI, true);
});

// ---------------------------------------------------------------------------
// Thousands of generated messages (English, Hinglish, Hindi, 1 to 4 activities)
// ---------------------------------------------------------------------------
const eq = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => a[k] === v);
const generated = build(3000, NOW);
const tally = { en: { n: 0, right: 0 }, hi: { n: 0, right: 0 }, dv: { n: 0, right: 0 } };
const wrong = [];
for (const c of generated) {
  const d = analyzeDatePhrase(c.text, NOW);
  tally[c.L].n += 1;
  if (d.ambiguous) continue;
  const r = parseSadhna(d.cleaned, ACTS);
  if (r.needsAI || !r.updates.length) continue;
  const got = Object.fromEntries(r.updates.map((u) => [u.activity_id, u.value]));
  if (eq(got, c.truth)) tally[c.L].right += 1;
  else wrong.push({ text: c.text, got, want: c.truth });
}
test("SAFETY: of 3000 generated messages, none is accepted with a wrong answer", () => {
  assert.deepEqual(wrong.slice(0, 5), []);
});
test("generated English messages: at least 88% are understood without the AI", () => assert.ok(tally.en.right / tally.en.n >= 0.88, JSON.stringify(tally.en)));
test("generated Hinglish messages: at least 85% are understood without the AI", () => assert.ok(tally.hi.right / tally.hi.n >= 0.85, JSON.stringify(tally.hi)));
test("generated Hindi messages: at least 85% are understood without the AI", () => assert.ok(tally.dv.right / tally.dv.n >= 0.85, JSON.stringify(tally.dv)));
test("generated messages get the right day", () => {
  let bad = 0;
  for (const c of generated) {
    if (c.kinds.includes("zero")) continue; // those sentences carry their own "aaj"/"kal"
    const d = analyzeDatePhrase(c.text, NOW);
    if ((c.date === null ? d.date !== null : d.date !== c.date)) bad += 1;
  }
  assert.equal(bad, 0);
});

test("SAFETY: adding an unrelated number to an understood message sends it to the AI step", () => {
  let accepted = 0;
  for (const c of generated.slice(0, 1000)) {
    const base = parseSadhna(analyzeDatePhrase(c.text, NOW).cleaned, ACTS);
    if (base.needsAI || !base.updates.length) continue;
    const more = parseSadhna(analyzeDatePhrase(c.text + " 99", NOW).cleaned, ACTS);
    if (!more.needsAI && more.updates.length) accepted += 1;
  }
  assert.equal(accepted, 0);
});

test("random word soup never throws", () => {
  const V = ["chanting", "16", "rounds", "mala", "woke", "at", "4:30", "am", "pm", "baje", "utha", "hearing", "30", "min", "ghanta", "nahi", "hua", "mangal", "aarti", "kal", "aaj", "and", "aur", ",", ".", "1/2", "-", "sorry", "reading", "soya", "din", "me", "1", "dedh", "aadha", "\n", "माला", "आज", "x"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 5000; i++) {
    const s = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => V[Math.floor(rnd() * V.length)]).join(rnd() < 0.5 ? " " : "");
    parseSadhna(analyzeDatePhrase(s, NOW).cleaned, ACTS);
  }
});
test("huge input is quick and goes to the AI step", () => {
  const start = Date.now();
  for (const s of ["chanting 1 ".repeat(5000), "1".repeat(100000), "a ".repeat(100000), "woke at 4:30 and ".repeat(3000)]) {
    assert.equal(parseSadhna(analyzeDatePhrase(s, NOW).cleaned, ACTS).needsAI, true);
  }
  assert.ok(Date.now() - start < 2000);
});
test("activity names with odd characters never break the parser", () => {
  for (const name of ["Chanting (rounds)", "Hearing [MIN]", "C++ class", "a|b", "*", "(", "\\", "Japa?", "$1"]) {
    parseSadhna("chanting 16 hearing 30 min", [mk(1, name, "duration", "hearing"), mk(2, name + "x", "number", "chanting")]);
  }
});
