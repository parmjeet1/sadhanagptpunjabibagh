/**
 * DB-003 - automation self-test (TEST database only).  See DBnew.md, entry DB-003.
 * Creates ONE throwaway table, `db_dependency_selftest`, with the same columns as the app's real
 * `db_dependency` table, and puts ONE mock row in it (MOCK_ROW below). It never touches `db_dependency`
 * and never drops anything. Its only job is to prove the whole after-deploy chain works: new numbered
 * file -> picked up -> created -> result email. Remove it when the test is done:
 * DROP TABLE db_dependency_selftest;  and retire this file (see DBnew.md), otherwise every deploy
 * would create the table again.
 *
 * The mock row is the "About / story" content supplied by the developer for testing. Contact details
 * and the payment key are placeholders, and the two JSON columns were repaired (the spreadsheet export
 * had lost their quotes and commas).
 */
export const TABLE = "db_dependency_selftest";
export const COLUMN_COUNT = 17;

export const CREATE_SQL = `CREATE TABLE \`${TABLE}\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`dd_id\` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`time_zone\` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`country\` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`story_title\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT 'Story behind SadhanaGpt',
  \`story_desc\` longtext COLLATE utf8mb4_general_ci,
  \`story_content\` longtext COLLATE utf8mb4_general_ci,
  \`story_url\` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`story_url_text\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`video_link\` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`dev_mobile\` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`dev_email\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`fellow_developers\` text COLLATE utf8mb4_general_ci,
  \`book_price\` int DEFAULT '100',
  \`razorpay_key_id\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`tech_seva\` json DEFAULT NULL,
  \`what_we_build\` json DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;

export const MOCK_ROW = {
  dd_id: null,
  time_zone: null,
  country: null,
  story_title: "Technology in the service of devotion",
  story_desc: "SadhanaGPT is built by a team of devotees. We create software for temples, sevas and spiritual communities.",
  story_content: `A dream that began in 2022

In 2022, our counsellor, HG Manavantar Prabhu ji, saw devotees struggle with a quiet challenge. They wanted to be sincere in their sadhana (chanting, reading Srila Prabhupada's books, rising early), but busy lives made it hard to stay steady.

Counsellors struggled too. Caring for dozens of devotees through notebooks, spreadsheets and WhatsApp messages meant important moments of care were often missed.

His dream: what if technology could serve devotees like a caring friend? It would remind them gently, track their progress lovingly, and help counsellors notice who needs attention.

Waiting for Krishna's arrangement

For almost three years, the dream stayed in his heart. The right devotees, skills and time had not yet come together.

2025: the seva begins

In 2025, a small team of devotee developers came together to offer their skills in seva. There was no company and no investors, only late nights and a shared desire to serve. Step by step, SadhanaGPT grew:

Daily sadhana tracking in seconds
Counsellor dashboards to see progress at a glance
Gentle reminders so no day is forgotten
Weekly reports to see growth over time
An AI sadhana assistant: just say what you did, in English or Hindi
Built by devotees, for devotees

SadhanaGPT is not just an app. It is an offering. Every line of code carries one hope: that a devotee chants because of a small reminder, and that a counsellor reaches a struggling devotee in time.

We are a small group of servants, trying to serve the servants of the Lord.

Our prayer

May SadhanaGPT be a quiet companion in every devotee's journey, lovingly helping each soul come closer to Krishna.

If this seva touches your heart, use it sincerely, share it with fellow devotees, or offer your support.

Hare Krishna \u{1F64F}
The SadhanaGPT Seva Team`,
  story_url: "https://sadhanagpt.com/about",
  story_url_text: "Read Our Full Journey",
  video_link: null,
  dev_mobile: "0000000000",            // placeholder (real contact details are not copied into the repo)
  dev_email: "test@example.com",       // placeholder
  fellow_developers: "Paramjeet singh,Vivek Prajapati, Pradumn Kapil",
  book_price: 100,
  razorpay_key_id: "tested by claude", // placeholder, not a real key
  tech_seva: [
    { url: "https://tripa.in/whm/", description: "Inventory & stock management for temple book distribution warehouses.", project_name: "Book Distribution Warehouse Management" },
    { url: "https://tripa.in/tours", description: "Automated Tours, Dhama yatra management", project_name: "Vaishnava Dham yatra app" },
  ],
  what_we_build: [
    { icon: "\u{1F4DA}", title: "Book Distribution Tracker", description: "Stock, sankirtan scores and marathon reports." },
    { icon: "\u{1FA94}", title: "Donation & Receipt System", description: "Online seva, auto receipts, donor records." },
    { icon: "\u{1F389}", title: "Festival & Event Registration", description: "Janmashtami, Ratha Yatra, retreats, passes." },
    { icon: "\u{1F465}", title: "Congregation & Counsellor CRM", description: "Devotee records, counsellor groups, follow-ups." },
    { icon: "\u{1F4FF}", title: "Sadhana Tracking", description: "Daily japa, reading and seva with AI insights." },
    { icon: "\u{1F372}", title: "Prasadam & Kitchen Inventory", description: "Rations, bhoga planning, stock alerts." },
    { icon: "\u{1F6D5}", title: "Yatra & Guest House Booking", description: "Pilgrimage tours, rooms and payments." },
    { icon: "\u{1F393}", title: "Online Courses (Gita / Bhakti)", description: "Classes, attendance, quizzes, certificates." },
    { icon: "\u{1F64B}\u200D\u2642\uFE0F", title: "Volunteer Seva Scheduler", description: "Assign seva slots, reminders, attendance." },
  ],
};

const JSON_COLUMNS = ["tech_seva", "what_we_build"];

/** The INSERT for the one mock row (values are passed separately, never pasted into the SQL). */
export const buildInsert = (row = MOCK_ROW) => {
  const names = Object.keys(row);
  return {
    sql: `INSERT INTO \`${TABLE}\` (${names.map((n) => `\`${n}\``).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
    values: names.map((n) => (JSON_COLUMNS.includes(n) ? JSON.stringify(row[n]) : row[n])),
  };
};

const rowCount = async (db) => {
  const [[r]] = await db.query(`SELECT COUNT(*) AS n FROM \`${TABLE}\``);
  return Number(r.n);
};

const tableExists = async (db) => {
  const [rows] = await db.query(
    `SELECT 1 AS x FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, [TABLE]);
  return rows.length > 0;
};

export const change = {
  id: "DB-003",
  title: "automation self-test table with one mock row (db_dependency_selftest)",

  async check(db) {
    if (!(await tableExists(db))) return { state: "missing" };
    const n = await rowCount(db);
    return n >= 1 ? { state: "applied" } : { state: "partial", detail: `table ${TABLE} exists but has no rows; drop it (DROP TABLE ${TABLE};) and deploy again` };
  },

  async apply(db) {
    await db.query(CREATE_SQL);
    const { sql, values } = buildInsert();
    await db.query(sql, values);
  },

  async verify(db) {
    if (!(await tableExists(db))) return `table ${TABLE} was not found after creating it.`;
    const [[c]] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [TABLE]);
    if (Number(c.n) !== COLUMN_COUNT) return `table ${TABLE} has ${c.n} columns (expected ${COLUMN_COUNT}).`;
    const n = await rowCount(db);
    if (n !== 1) return `table ${TABLE} has ${n} rows (expected 1 mock row).`;
    change.successText = `Test table ${TABLE} created (${COLUMN_COUNT} columns, same layout as db_dependency) with 1 mock row. The real db_dependency table was not touched. When the test is finished run: DROP TABLE ${TABLE};`;
    return null;
  },
};
