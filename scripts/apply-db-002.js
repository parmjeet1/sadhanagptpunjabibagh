/**
 * DB-002 - one-time apply script (TEST database).  See DBnew.md, entry DB-002.
 *
 * Adds users.personal_marking_scheme_id (+ index + foreign key) for the "own marking scheme" feature.
 *
 * Run once, right after the backend is deployed:
 *     node scripts/apply-db-002.js --confirm-test
 *
 * - Safe to run again: if the change is already there it does nothing.
 * - Refuses to run without --confirm-test, so it is never run on production by accident.
 * - It checks first, runs ONE ALTER TABLE (a single statement either fully works or does not change
 *   anything), then checks the result.
 * - Result goes to the screen and by email to md.gkg.sp@gmail.com (or DB_MIGRATION_NOTIFY_EMAIL if set
 *   in the server's .env): "applied" or "FAILED". A FAILED mail explains the error in plain English plus
 *   the technical message. An "already applied" run sends no email.
 * - Exit code 0 = fine (applied or already applied), 1 = failed (a developer must cross-check).
 *
 * Undo (by hand): the "Undo" statement of DB-002 in DBnew.md.
 */
import { pathToFileURL } from "node:url";

/** Who gets the result email (override with DB_MIGRATION_NOTIFY_EMAIL in .env). */
export const DEFAULT_NOTIFY_EMAIL = "md.gkg.sp@gmail.com";

export const COLUMN = "personal_marking_scheme_id";
export const FK_NAME = "fk_users_personal_scheme";

export const ALTER_SQL = `ALTER TABLE \`users\`
  ADD COLUMN \`${COLUMN}\` BIGINT(20) NULL DEFAULT NULL AFTER \`top_ranker_to\`,
  ADD KEY \`idx_users_personal_scheme\` (\`${COLUMN}\`),
  ADD CONSTRAINT \`${FK_NAME}\` FOREIGN KEY (\`${COLUMN}\`)
    REFERENCES \`marking_schemes\` (\`id\`) ON DELETE SET NULL`;

/** Plain-English meaning of the usual database errors (code or number -> what it means / what to do). */
export const explainError = (err) => {
  const code = String(err?.code || "");
  const no = Number(err?.errno || 0);
  const msg = String(err?.message || "");
  if (code === "ER_DUP_FIELDNAME" || no === 1060) return "The column already exists, so someone (or an earlier run) already added it. Check SHOW COLUMNS FROM users LIKE 'personal_marking_scheme_id'.";
  if (code === "ER_DUP_KEYNAME" || no === 1061) return "The index idx_users_personal_scheme already exists. Check SHOW CREATE TABLE users for a half-finished earlier attempt.";
  if (code === "ER_CANT_CREATE_TABLE" || code === "ER_FK_INCOMPATIBLE_COLUMNS" || code === "ER_FK_NO_INDEX_PARENT" || no === 1215 || no === 1005 || no === 3780 || /foreign key/i.test(msg)) return "The foreign key to marking_schemes(id) could not be created. Usually the two columns differ in type (users column is BIGINT(20); marking_schemes.id must be the same) or marking_schemes is not InnoDB. Compare SHOW CREATE TABLE marking_schemes.";
  if (code === "ER_TABLEACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR" || code === "ER_ACCESS_DENIED_ERROR" || [1044, 1045, 1142, 1143].includes(no)) return "The database user in .env is not allowed to ALTER the table (or the login is wrong). Run the ALTER with a user that has ALTER and REFERENCES rights, or fix DB_USERNAME / DB_PASSWORD.";
  if (code === "ER_LOCK_WAIT_TIMEOUT" || code === "ER_LOCK_DEADLOCK" || no === 1205 || no === 1213) return "The users table was busy (locked by another query) so the change gave up. Nothing was changed. Run the script again at a quieter moment.";
  if (code === "ER_NO_SUCH_TABLE" || no === 1146) return "A table the script needs (users or marking_schemes) does not exist in this database. Check DB_NAME in .env points to the test database.";
  if (code === "ER_BAD_DB_ERROR" || no === 1049) return "The database name in .env does not exist. Check DB_NAME.";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "PROTOCOL_CONNECTION_LOST", "ECONNRESET"].includes(code)) return "The script could not reach the database server. Check the server is running and DB_HOST / DB_PORT in .env are right. Nothing was changed.";
  return "Unexpected database error. Nothing else was changed by this script; a developer should read the technical message below and cross-check the users table.";
};

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

/**
 * Does the whole job. Never throws.
 * @returns {Promise<{state:'applied'|'already'|'failed', message:string, step?:string, technical?:string, explanation?:string}>}
 */
export const applyDb002 = async (db) => {
  let step = "checking the current state";
  try {
    // 1. already there?
    const hasColumn = await columnExists(db);
    const hasFk = await foreignKeyExists(db);
    if (hasColumn && hasFk) {
      return { state: "already", message: `DB-002 was already applied (column ${COLUMN} and ${FK_NAME} exist). Nothing changed.` };
    }
    if (hasColumn !== hasFk) {
      return {
        state: "failed",
        message: `Half-applied state found (column exists: ${hasColumn}, foreign key exists: ${hasFk}). Nothing was changed. A developer must look at it.`,
      };
    }

    // 2. the table we point at must have its id as PRIMARY KEY
    const [pk] = await db.query(
      `SELECT 1 AS x FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marking_schemes' AND COLUMN_NAME = 'id' AND COLUMN_KEY = 'PRI' LIMIT 1`);
    if (pk.length === 0) {
      return { state: "failed", message: "marking_schemes.id is not a PRIMARY KEY (or the table is missing). Nothing was changed." };
    }

    // 3. the one change
    step = "running the ALTER TABLE";
    await db.query(ALTER_SQL);

    // 4. check the result
    step = "checking the result after the ALTER";
    const okColumn = await columnExists(db);
    const okFk = await foreignKeyExists(db);
    const [[counts]] = await db.query(
      `SELECT COUNT(*) AS total, SUM(${COLUMN} IS NOT NULL) AS filled FROM users`);
    if (!okColumn || !okFk) {
      return { state: "failed", message: `ALTER ran but the check failed (column: ${okColumn}, foreign key: ${okFk}). A developer must look at it.` };
    }
    if (Number(counts.filled) !== 0) {
      return { state: "failed", message: `ALTER ran, but ${counts.filled} users already have a value in the new column (expected 0). A developer must look at it.` };
    }
    return {
      state: "applied",
      message: `DB-002 applied OK: column ${COLUMN}, its index and ${FK_NAME} exist. Users: ${counts.total}, all with an empty value (as expected). The app switches the feature on by itself within about a minute; no restart needed.`,
    };
  } catch (err) {
    return {
      state: "failed",
      message: `DB-002 FAILED while ${step}: ${err?.code ? err.code + " - " : ""}${err?.message || err}`,
      step,
      technical: `${err?.code ? err.code : "no code"}${err?.errno ? " (errno " + err.errno + ")" : ""}${err?.sqlState ? " sqlState " + err.sqlState : ""}: ${err?.message || err}`,
      explanation: explainError(err),
    };
  }
};

/** Sends the result mail. Never throws; returns a short text for the screen. */
export const sendResultMail = async (transporter, result, env = process.env, now = new Date()) => {
  const to = env.DB_MIGRATION_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL;
  if (result.state === "already") return "No email sent (nothing changed this time).";
  try {
    const ok = result.state === "applied";
    const when = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
    await transporter.sendMail({
      from: `SadhanaGPT <${env.MAIL_USERNAME || env.GMAIL_USER || ""}>`,
      to,
      subject: ok ? "[SadhanaGPT TEST] DB-002 applied successfully" : "[SadhanaGPT TEST] DB-002 FAILED - developer please check",
      text: [
        ok ? "DB-002 was applied successfully on the TEST database." : "DB-002 FAILED on the TEST database.",
        "",
        result.message,
        ...(ok ? [] : [
          "",
          "WHAT WENT WRONG",
          `Step: ${result.step || "checks before the change"}`,
          `What it means: ${result.explanation || "The script stopped before changing anything; see the message above."}`,
          ...(result.technical ? [`Technical message (for the developer): ${result.technical}`] : []),
          "The script changes the table with one single ALTER statement, so a failed ALTER leaves the table as it was.",
        ]),
        "",
        `Time: ${when} IST`,
        `Database: TEST (run with --confirm-test)`,
        ok ? "Next: try 'Use for me' on the test site, then update DBnew.md (DONE-TEST)." : "Next: a developer should cross-check the database (see DB-002 in DBnew.md), fix the cause above and run the script again. Use the Undo statement only if the column was added by mistake.",
        "Developer: Manvatar Prabhu Ji",
      ].join("\n"),
    });
    return `Email sent to ${to}.`;
  } catch (err) {
    return `Email could NOT be sent (${err?.message || err}). The result above is still valid.`;
  }
};

const main = async () => {
  if (!process.argv.includes("--confirm-test")) {
    console.error("Refusing to run: add --confirm-test to confirm this is the TEST database.\n  node scripts/apply-db-002.js --confirm-test");
    process.exit(1);
  }
  const { default: transporter } = await import("../utils/emails/mailer.js");
  let db = null;
  let result;
  try {
    ({ default: db } = await import("../config/database.js"));
    result = await applyDb002(db);
  } catch (err) {
    result = {
      state: "failed",
      message: `DB-002 FAILED before it could start: ${err?.message || err}`,
      step: "starting the script",
      technical: `${err?.code || "no code"}: ${err?.message || err}`,
      explanation: explainError(err),
    };
  }
  console.log(`[DB-002] ${result.state.toUpperCase()}: ${result.message}`);
  console.log(`[DB-002] ${await sendResultMail(transporter, result)}`);

  if (db) await db.end().catch(() => {});
  process.exit(result.state === "failed" ? 1 : 0);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
