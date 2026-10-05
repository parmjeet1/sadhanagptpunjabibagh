/**
 * DB-002 - a person's own (personal) marking scheme.  See DBnew.md, entry DB-002.
 * Adds users.personal_marking_scheme_id (+ index + foreign key). One ALTER TABLE statement.
 * Run by scripts/after-deploy-test.sh through scripts/db-changes/run-all.js (test database only).
 * Undo (by hand): the "Undo" statement of DB-002 in DBnew.md.
 */
export const COLUMN = "personal_marking_scheme_id";
export const FK_NAME = "fk_users_personal_scheme";

export const ALTER_SQL = `ALTER TABLE \`users\`
  ADD COLUMN \`${COLUMN}\` BIGINT(20) NULL DEFAULT NULL AFTER \`top_ranker_to\`,
  ADD KEY \`idx_users_personal_scheme\` (\`${COLUMN}\`),
  ADD CONSTRAINT \`${FK_NAME}\` FOREIGN KEY (\`${COLUMN}\`)
    REFERENCES \`marking_schemes\` (\`id\`) ON DELETE SET NULL`;

const columnExists = async (db) => {
  const [rows] = await db.query(
    `SELECT 1 AS x FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ? LIMIT 1`, [COLUMN]);
  return rows.length > 0;
};

const foreignKeyExists = async (db) => {
  const [rows] = await db.query(
    `SELECT 1 AS x FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
        AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`, [FK_NAME]);
  return rows.length > 0;
};

export const change = {
  id: "DB-002",
  title: "own marking scheme column on users",

  async check(db) {
    const hasColumn = await columnExists(db);
    const hasFk = await foreignKeyExists(db);
    if (hasColumn && hasFk) return { state: "applied" };
    if (hasColumn !== hasFk) return { state: "partial", detail: `column exists: ${hasColumn}, foreign key exists: ${hasFk}` };
    return { state: "missing" };
  },

  async precheck(db) {
    const [pk] = await db.query(
      `SELECT 1 AS x FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marking_schemes' AND COLUMN_NAME = 'id' AND COLUMN_KEY = 'PRI' LIMIT 1`);
    return pk.length === 0 ? "marking_schemes.id is not a PRIMARY KEY (or the table is missing)." : null;
  },

  async apply(db) {
    await db.query(ALTER_SQL);
  },

  async verify(db) {
    const okColumn = await columnExists(db);
    const okFk = await foreignKeyExists(db);
    if (!okColumn || !okFk) return `column exists: ${okColumn}, foreign key exists: ${okFk}.`;
    const [[counts]] = await db.query(`SELECT COUNT(*) AS total, SUM(${COLUMN} IS NOT NULL) AS filled FROM users`);
    if (Number(counts.filled) !== 0) return `${counts.filled} users already have a value in the new column (expected 0).`;
    change.successText = `Column ${COLUMN}, its index and ${FK_NAME} exist. Users: ${counts.total}, all with an empty value (as expected). The app switches the feature on by itself within about a minute; no restart needed.`;
    return null;
  },
};
