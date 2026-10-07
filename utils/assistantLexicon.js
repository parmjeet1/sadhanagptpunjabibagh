/**
 * assistantLexicon — the nicknames students use for each sadhana activity,
 * plus the number, unit and time words of English, Hinglish (Hindi in Roman
 * letters) and Hindi (Devanagari).
 *
 * This file is only a word list. To teach the chatbot a new nickname, add it
 * to the right list below (lower case) and add one line to
 * tests/assistantParser.test.mjs.
 *
 * A space inside a phrase also matches a hyphen or no space at all, so
 * "wake up" covers "wake-up" and "wakeup" too.
 */

// ---------------------------------------------------------------------------
// Nicknames per kind of activity (the same "category" the backend gives each
// activity from its name: see inferCategory in AssistantController.js).
// ---------------------------------------------------------------------------
export const NICKNAMES = {
  // Chanting rounds (a count)
  chanting: {
    phrases: [
      // English
      "chanting", "chant", "chanted", "chants", "chanter", "round", "rounds", "rnd", "rnds", "rd", "rds",
      "japa mala", "mantra", "maha mantra", "mahamantra", "hare krishna mantra",
      // Hinglish
      "japa", "jap", "jaap", "japam", "mala", "malas", "maala", "malaa", "harinam", "hari naam", "hari nam",
      "harinaam", "naam jap", "naam japa", "jap kiya", "japa kiya",
      // Hindi
      "जप", "जाप", "माला", "माळा", "राउंड", "राऊंड", "चैंटिंग", "चैन्टिंग", "हरिनाम", "हरि नाम", "मंत्र", "महामंत्र",
    ],
  },

  // Chanting completion time (the clock time the rounds were finished)
  chanting_completion_time: {
    phrases: [
      "completed", "complete", "completion", "finish", "finished", "finishing", "ended", "over",
      "khatam", "khatm", "khatam hua", "poora", "pura", "poori", "puri", "purn", "purna", "samapt",
      "पूरा", "पूरी", "खत्म", "समाप्त",
    ],
  },

  // Hearing lectures, classes, katha
  hearing: {
    phrases: [
      // English
      "hearing", "hear", "heard", "hears", "listen", "listened", "listening", "lecture", "lectures", "class",
      "classes", "discourse", "sermon", "satsang", "sat sang",
      // Hinglish
      "suna", "suni", "sunna", "sunne", "sunaa", "sunta", "sunti", "sune", "sun liya", "sun li",
      "pravachan", "pravachana", "pravachans", "katha", "kathaa", "shravan", "shravana", "shravanam",
      "sravan", "sravana", "sravanam", "bhagavatam class", "gita class", "sb class",
      // Hindi
      "श्रवण", "प्रवचन", "सुना", "सुनी", "सुनना", "सुने", "कथा", "क्लास", "सत्संग", "लेक्चर", "हियरिंग",
    ],
  },

  // Reading books
  reading: {
    phrases: [
      // English
      "reading", "read", "reads", "book", "books", "bhagavatam", "bhagwatam", "bhagavad gita", "bhagwad gita",
      "srimad bhagavatam", "srimad bhagwatam", "caitanya caritamrita", "chaitanya charitamrita", "gita", "geeta",
      "sb", "bg", "cc", "ramayana", "ramayan", "isopanishad", "upanishad", "scripture", "scriptures",
      // Hinglish
      "padha", "padhi", "padhe", "padhna", "padhta", "padhti", "padhne", "padhai", "padh liya", "padh li",
      "pustak", "pustakein", "granth", "swadhyay", "svadhyay", "swadhyaya", "svadhyaya", "paath", "path kiya",
      // Hindi
      "पढ़ा", "पढ़ी", "पढ़े", "पढ़ना", "पढ़ने", "पढ़ाई", "किताब", "किताबें", "पुस्तक", "ग्रंथ", "भागवतम", "गीता",
      "स्वाध्याय", "पाठ", "रीडिंग",
    ],
  },

  // Rest in the day
  day_rest: {
    phrases: [
      // English
      "rest", "rested", "resting", "day rest", "dayrest", "nap", "naps", "napped", "napping", "power nap",
      "siesta", "relax", "relaxed", "relaxing", "afternoon rest", "afternoon nap", "day nap", "day sleep",
      "daytime sleep", "afternoon sleep",
      // Hinglish
      "aaram", "araam", "aram", "aaram kiya", "vishram", "vishraam", "dopahar ki neend", "din ki neend",
      // Hindi
      "आराम", "विश्राम", "झपकी", "दोपहर की नींद", "दिन की नींद",
    ],
  },

  // Going to sleep at night
  sleep: {
    phrases: [
      // English
      "sleep", "sleeps", "slept", "sleeping", "bed", "bedtime", "went to bed", "go to bed",
      "going to bed", "hit the bed", "hit bed", "lights off", "lights out",
      // Hinglish
      "soya", "soyi", "soye", "soi", "so gaya", "so gayi", "so gaye", "so gya", "so gai", "sone", "sona",
      "sone gaya", "sone gayi", "so jata", "so jati", "neend", "nind",
      // Hindi
      "सोया", "सोई", "सोये", "सो गया", "सो गई", "सो गये", "सो गयी", "सोना", "सोने", "नींद", "बिस्तर",
    ],
  },

  // Waking up
  wakeup: {
    phrases: [
      // English
      "woke", "woke up", "wake", "wake up", "wakeup", "wokeup", "waking", "waking up", "awake",
      "got up", "get up", "getting up", "gets up", "rose", "rise", "rising",
      // Hinglish
      "utha", "uthaa", "uthi", "uthe", "uthna", "uthta", "uthti", "uthne", "uth gaya", "uth gayi", "uth gaye",
      "uth gya", "uth gai", "jaga", "jaaga", "jaagi", "jagi", "jagna", "jaagna", "aankh khuli", "ankh khuli",
      "neend khuli", "nind khuli",
      // Hindi
      "उठा", "उठी", "उठे", "उठना", "उठने", "उठ गया", "उठ गई", "जागा", "जागी", "जागना", "आँख खुली", "आंख खुली",
      "नींद खुली",
    ],
  },

  // Attending Mangal Aarti (yes / no)
  mangal_aarti: {
    phrases: [
      "morning aarti", "morning arti", "morning arati", "मंगल आरती", "मंगला आरती",
    ],
    // mangal / mangala / mangla + aarti spelled many ways: arti, aarti, arati,
    // aarathi, aratik ...
    patterns: ["mangal+a?\\s*-?a+r(?:a)?(?:t|th)(?:i|y|ik)?", "mangla\\s*-?a+r(?:a)?(?:t|th)(?:i|y|ik)?", "मंगल\\s*आरती", "मंगला\\s*आरती"],
    // A bare "aarti" with no "mangal" in front also counts (people shorten it),
    // unless it is another aarti (see OTHER_AARTI_WORDS).
    bare: ["a+r(?:a)?(?:t|th)(?:i|y|ik)", "आरती"],
  },
};

// "sandhya aarti", "gaur aarti" ... are different practices — never Mangal Aarti.
export const OTHER_AARTI_WORDS = [
  "sandhya", "shayan", "shayana", "gaur", "gaura", "dhoop", "dhup", "sringar", "shringar", "raj bhog",
  "rajbhog", "bhog", "guru", "narsimha", "narasimha", "tulasi", "tulsi", "evening", "night", "sham", "shaam", "raat",
  "संध्या", "शयन", "गौर", "धूप", "श्रृंगार", "भोग", "गुरु", "नृसिंह", "तुलसी", "शाम", "रात",
];

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export const COUNT_UNITS = ["rounds", "round", "malas", "mala", "maala", "malaa", "japa", "jap", "rnds", "rnd", "rds", "rd", "राउंड", "राऊंड", "माला", "माळा"];
export const MINUTE_UNITS = ["minutes", "minute", "mins", "min", "mint", "minat", "minit", "minuts", "mnt", "mnts", "mn", "मिनट", "मिनिट", "मिंट"];
export const HOUR_UNITS = ["hours", "hour", "hrs", "hr", "ghantey", "ghante", "ghanton", "ghanta", "ghnta", "gnta", "gante", "ghantaa", "घण्टा", "घण्टे", "घंटा", "घंटे", "घन्टा"];

// "baje" = o'clock
export const BAJE_WORDS = ["baje", "bje", "bajey", "baj", "बजे", "बजकर"];

// ---------------------------------------------------------------------------
// Number words (in front of a unit or "baje"): "solah mala" = 16 mala
// ---------------------------------------------------------------------------
export const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, chhah: 6, che: 6, chhey: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, pachees: 25, tees: 30, chalis: 40,
  paintalis: 45, pachas: 50,
  // Devanagari
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, छे: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11,
  बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, पन्द्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  पच्चीस: 25, तीस: 30, चालीस: 40, पैंतालीस: 45, पचास: 50,
};

// ---------------------------------------------------------------------------
// Helpers that turn the lists above into search patterns
// ---------------------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "wake up" -> wake[\s-]*up ; longest phrases first so "woke up" beats "woke". */
export function phrasesToSource(phrases) {
  return [...new Set(phrases)]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.split(/\s+/).map(escapeRe).join("[\\s-]*"))
    .join("|");
}

/** The pattern (as text) that finds any nickname of a category. */
export function categorySource(category) {
  const entry = NICKNAMES[category];
  if (!entry) return null;
  const parts = [];
  if (entry.patterns?.length) parts.push(...entry.patterns);
  if (entry.phrases?.length) parts.push(phrasesToSource(entry.phrases));
  return parts.join("|");
}

/** All single words that appear in a category's nicknames (to tell a generic name from a specific one). */
export function categoryWords(category) {
  const entry = NICKNAMES[category];
  if (!entry) return new Set();
  const out = new Set();
  for (const p of entry.phrases || []) for (const w of p.toLowerCase().split(/\s+/)) out.add(w);
  return out;
}

// ---------------------------------------------------------------------------
// Nicknames for individual activities (found by the activity's NAME)
// ---------------------------------------------------------------------------
// The master list has activities that are not a general kind of activity —
// "Study Hours", "Menial Services", "Shloka Memorisation", "Book distribution" —
// or are a more specific version of one ("Hearing Srila Prabhupada",
// "Hearing Spiritual Master", "Reading Srila Prabhupada Book",
// "Reading Misc. Books"). Each entry below says which activity it is
// (nameMatch is tested against the activity's name) and what students call it.
//
//   forceCustom  treat it as its own activity, not as a kind of reading/hearing
//   needsUnit    only accept an amount that comes with min / hour / ghanta
//                (a bare "10 books distributed" is a number of books, not minutes)
export const ACTIVITY_NICKNAMES = [
  {
    key: "study",
    nameMatch: "study|studies|adhyayan|अध्ययन",
    forceCustom: true,
    phrases: [
      "study", "studies", "studying", "studied", "study hours", "study time", "adhyayan", "adhyan", "अध्ययन", "स्टडी",
    ],
  },
  {
    key: "menial",
    nameMatch: "menial|seva|sewa|service",
    forceCustom: true,
    phrases: [
      "menial service", "menial services", "menial seva", "menial", "seva", "sewa", "service", "services",
      "temple seva", "temple service", "kitchen seva", "kitchen service", "cleaning seva", "cleaning", "cooking seva",
      "sevaa", "सेवा", "मेनियल", "सफाई", "रसोई सेवा",
    ],
  },
  {
    key: "shloka",
    nameMatch: "shlok|slok|memori[sz]|verse",
    forceCustom: true,
    phrases: [
      "shloka memorisation", "shloka memorization", "shloka", "shlok", "shlokas", "sloka", "slokas", "slok",
      "verse", "verses", "memorisation", "memorization", "memorise", "memorize", "memorised", "memorized",
      "memorising", "memorizing", "yaad kiya", "yaad kiye", "yaad kar", "kanthastha", "kanthasth", "kantasth",
      "श्लोक", "श्लोकों", "याद किया", "कंठस्थ", "कण्ठस्थ",
    ],
  },
  {
    key: "distribution",
    nameMatch: "distribut|sankirtan|book\\s*dist",
    forceCustom: true,
    needsUnit: true,
    phrases: [
      "book distribution", "books distribution", "book distributing", "books distributed", "book distributed",
      "distribution", "distributed", "distributing", "distribute", "sankirtan", "sankirtana", "sankeertan", "bd",
      "book dist", "book vitran", "vitran", "vitaran", "बुक डिस्ट्रीब्यूशन", "डिस्ट्रीब्यूशन", "संकीर्तन", "वितरण",
    ],
  },
  {
    key: "prabhupada_reading",
    nameMatch: "prabhupada|\\bsp\\b",
    category: "reading",
    phrases: [
      "sp book", "sp books", "srila prabhupada book", "srila prabhupada books", "prabhupada book", "prabhupada books",
      "prabhupada's book", "prabhupada's books", "prabhupada ki book", "prabhupada ki kitab", "prabhupada ki pustak",
      "prabhupada ke granth", "prabhupada granth", "प्रभुपाद की किताब", "प्रभुपाद की पुस्तक", "प्रभुपाद पुस्तक",
    ],
  },
  {
    key: "prabhupada_hearing",
    nameMatch: "prabhupada|\\bsp\\b",
    category: "hearing",
    phrases: [
      "sp lecture", "sp lectures", "sp class", "srila prabhupada lecture", "srila prabhupada lectures", "srila prabhupada class",
      "prabhupada lecture", "prabhupada lectures", "prabhupada class", "prabhupada ka lecture", "prabhupada ki class",
      "prabhupada ka pravachan", "prabhupada pravachan", "prabhupada ki katha", "प्रभुपाद प्रवचन", "प्रभुपाद का प्रवचन",
      "प्रभुपाद लेक्चर", "प्रभुपाद क्लास",
    ],
  },
  {
    key: "spiritual_master_hearing",
    nameMatch: "spiritual\\s*master|guru",
    category: "hearing",
    phrases: [
      "spiritual master", "spiritual master lecture", "spiritual master class", "guru maharaj", "guru maharaja", "guru maharaj ka lecture",
      "guru maharaj ki class", "guru maharaj ka pravachan", "gurudev", "guru dev", "guruji", "guru ji", "gm class", "gm lecture",
      "guru lecture", "guru class", "guru pravachan", "गुरु महाराज", "गुरुदेव", "गुरुजी", "गुरु जी", "गुरु प्रवचन",
    ],
  },
  {
    key: "misc_reading",
    nameMatch: "misc|\\bother\\b",
    category: "reading",
    phrases: [
      "misc books", "misc book", "misc", "miscellaneous books", "miscellaneous book", "miscellaneous", "other books", "other book",
      "anya pustak", "anya books", "अन्य पुस्तक", "अन्य किताबें",
    ],
  },
];

/** The entry for an activity, found by its name (and kind, when the entry says so). */
export function activityNicknameFor(name, category) {
  const n = String(name || "").toLowerCase();
  for (const entry of ACTIVITY_NICKNAMES) {
    if (entry.category && entry.category !== category) continue;
    if (new RegExp(entry.nameMatch, "iu").test(n)) return entry;
  }
  return null;
}
