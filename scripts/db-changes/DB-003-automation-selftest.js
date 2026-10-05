/**
 * DB-003 - automation self-test (TEST database only).  See DBnew.md, entry DB-003.
 * Creates ONE empty throwaway table, `db_dependency_selftest`, with the same columns as the app's
 * real `db_dependency` table. It never touches `db_dependency`, never drops anything and holds no data.
 * Its only job is to prove the whole after-deploy chain works: new numbered file -> picked up ->
 * created -> result email. Remove it when the test is done: DROP TABLE db_dependency_selftest;
 * and retire this file (see DBnew.md), otherwise every deploy would create the table again.
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

const tableExists = async (db) => {
  const [rows] = await db.query(
    `SELECT 1 AS x FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, [TABLE]);
  return rows.length > 0;
};

export const change = {
  id: "DB-003",
  title: "automation self-test table (db_dependency_selftest)",

  async check(db) {
    return (await tableExists(db)) ? { state: "applied" } : { state: "missing" };
  },

  async apply(db) {
    await db.query(CREATE_SQL);
  },

  async verify(db) {
    if (!(await tableExists(db))) return `table ${TABLE} was not found after creating it.`;
    const [[c]] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [TABLE]);
    if (Number(c.n) !== COLUMN_COUNT) return `table ${TABLE} has ${c.n} columns (expected ${COLUMN_COUNT}).`;
    change.successText = `Empty test table ${TABLE} created (${COLUMN_COUNT} columns, same layout as db_dependency, no data). The real db_dependency table was not touched. When the test is finished run: DROP TABLE ${TABLE};`;
    return null;
  },
};
