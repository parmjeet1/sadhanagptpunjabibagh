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
 * - Result goes to the screen and, when DB_MIGRATION_NOTIFY_EMAIL is set in the server's .env,
 *   an email "applied" or "FAILED". An "already applied" run sends no email.
 * - Exit code 0 = fine (applied or already applied), 1 = failed (a developer must cross-check).
 *
 * Undo (by hand): the "Undo" statement of DB-002 in DBnew.md.
 */
import { pathToFileURL } from "node:url";

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

/**
 * Does the whole job. Never throws.
 * @returns {Promise<{state:'applied'|'already'|'failed', message:string}>}
 */
export const applyDb002 = async (db) => {
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
    await db.query(ALTER_SQL);

    // 4. check the result
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
    return { state: "failed", message: `DB-002 FAILED: ${err?.code ? err.code + " - " : ""}${err?.message || err}` };
  }
};

/** Sends the result mail. Never throws; returns a short text for the screen. */
export const sendResultMail = async (transporter, result, env = process.env, now = new Date()) => {
  const to = env.DB_MIGRATION_NOTIFY_EMAIL;
  if (!to) return "No email sent (DB_MIGRATION_NOTIFY_EMAIL is not set in .env).";
  if (result.state === "already") return "No email sent (nothing changed this time).";
  try {
    const ok = result.state === "applied";
    const when = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
    await transporter.sendMail({
      from: `SadhanaGPT <${env.MAIL_USERNAME || env.GMAIL_USER || ""}>`,
      to,
      subject: ok ? "[SadhanaGPT TEST] DB-002 applied successfully" : "[SadhanaGPT TEST] DB-002 FAILED - developer please check",
      text: [
        result.message,
        "",
        `Time: ${when} IST`,
        `Database: TEST (run with --confirm-test)`,
        ok ? "Next: try 'Use for me' on the test site, then update DBnew.md (DONE-TEST)." : "Next: a developer should cross-check the database and DBnew.md (DB-002), then run the Undo statement only if needed.",
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
  const { default: db } = await import("../config/database.js");
  const { default: transporter } = await import("../utils/emails/mailer.js");

  const result = await applyDb002(db);
  console.log(`[DB-002] ${result.state.toUpperCase()}: ${result.message}`);
  console.log(`[DB-002] ${await sendResultMail(transporter, result)}`);

  await db.end().catch(() => {});
  process.exit(result.state === "failed" ? 1 : 0);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
