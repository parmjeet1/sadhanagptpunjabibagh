/**
 * Shared parts for the numbered database-change scripts (scripts/db-changes/DB-NNN-*.js).
 * A change script only describes ITS change (see DB-002-personal-marking-scheme.js);
 * checking, running, verifying, explaining errors and the result email live here.
 *
 * A change object has:
 *   id            "DB-002"                       (must match the file name and DBnew.md)
 *   title         short plain-English name
 *   check(db)     -> { state: "applied" | "missing" | "partial", detail? }   (is it already there?)
 *   precheck(db)  -> null, or a text saying why it must not run                (optional)
 *   apply(db)     runs the change (ONE statement where possible)
 *   verify(db)    -> null, or a text saying what is wrong after the change
 *   successText   text for the "applied" mail (optional)
 */

/** Who gets the result email (override with DB_MIGRATION_NOTIFY_EMAIL in .env). */
export const DEFAULT_NOTIFY_EMAIL = "md.gkg.sp@gmail.com";

/** Plain-English meaning of the usual database errors (code or number -> what it means / what to do). */
export const explainError = (err) => {
  const code = String(err?.code || "");
  const no = Number(err?.errno || 0);
  const msg = String(err?.message || "");
  if (code === "ER_DUP_FIELDNAME" || no === 1060) return "A column the change adds already exists, so someone (or an earlier run) already added it. Compare SHOW CREATE TABLE for the table named in the technical message.";
  if (code === "ER_DUP_KEYNAME" || no === 1061) return "An index the change adds already exists. Check SHOW CREATE TABLE for a half-finished earlier attempt.";
  if (code === "ER_CANT_CREATE_TABLE" || code === "ER_FK_INCOMPATIBLE_COLUMNS" || code === "ER_FK_NO_INDEX_PARENT" || no === 1215 || no === 1005 || no === 3780 || /foreign key/i.test(msg)) return "A foreign key could not be created. Usually the two columns differ in type/size or the other table is not InnoDB. Compare the column types with SHOW CREATE TABLE on both tables.";
  if (code === "ER_TABLEACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR" || code === "ER_ACCESS_DENIED_ERROR" || [1044, 1045, 1142, 1143].includes(no)) return "The database user in .env is not allowed to ALTER the table (or the login is wrong). Run the change with a user that has ALTER and REFERENCES rights, or fix DB_USERNAME / DB_PASSWORD.";
  if (code === "ER_LOCK_WAIT_TIMEOUT" || code === "ER_LOCK_DEADLOCK" || no === 1205 || no === 1213) return "The table was busy (locked by another query) so the change gave up. Nothing was changed. Run the deploy step again at a quieter moment.";
  if (code === "ER_NO_SUCH_TABLE" || no === 1146) return "A table the change needs does not exist in this database. Check DB_NAME in .env points to the test database.";
  if (code === "ER_BAD_DB_ERROR" || no === 1049) return "The database name in .env does not exist. Check DB_NAME.";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "PROTOCOL_CONNECTION_LOST", "ECONNRESET"].includes(code)) return "The script could not reach the database server. Check the server is running and DB_HOST / DB_PORT in .env are right. Nothing was changed.";
  return "Unexpected error. A developer should read the technical message below and cross-check the database.";
};

/**
 * Runs one change. Never throws.
 * @returns {Promise<{state:'applied'|'already'|'failed', message:string, step?:string, technical?:string, explanation?:string}>}
 */
export const runChange = async (db, change) => {
  const name = `${change.id} ${change.title}`;
  let step = "checking the current state";
  try {
    const current = await change.check(db);
    if (current.state === "applied") {
      return { state: "already", message: `${name}: already applied. Nothing changed.` };
    }
    if (current.state === "partial") {
      return { state: "failed", message: `${name}: half-applied state found (${current.detail || "see database"}). Nothing was changed. A developer must look at it.`, step };
    }

    step = "checking that the change is allowed";
    const blocked = change.precheck ? await change.precheck(db) : null;
    if (blocked) return { state: "failed", message: `${name}: ${blocked} Nothing was changed.`, step };

    step = "running the change";
    await change.apply(db);

    step = "checking the result after the change";
    const problem = await change.verify(db);
    if (problem) return { state: "failed", message: `${name}: the change ran but the check failed: ${problem} A developer must look at it.`, step };

    return { state: "applied", message: `${name}: applied OK. ${change.successText || ""}`.trim() };
  } catch (err) {
    return {
      state: "failed",
      message: `${name} FAILED while ${step}: ${err?.code ? err.code + " - " : ""}${err?.message || err}`,
      step,
      technical: `${err?.code ? err.code : "no code"}${err?.errno ? " (errno " + err.errno + ")" : ""}${err?.sqlState ? " sqlState " + err.sqlState : ""}: ${err?.message || err}`,
      explanation: explainError(err),
    };
  }
};

/**
 * The "from" address: MAIL_FROM, else GMAIL_USER (what the app's own emails use), else MAIL_USERNAME.
 * Only a value that really looks like an email address is used (MAIL_USERNAME is often just a login name).
 */
export const pickSender = (env = process.env) =>
  [env.MAIL_FROM, env.GMAIL_USER, env.MAIL_USERNAME]
    .map((v) => String(v || "").trim().replace(/^.*<(.+)>$/, "$1"))
    .find((v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) || null;

/** Sends the result mail. Never throws; returns a short text for the screen. "already applied" sends nothing. */
export const sendResultMail = async (transporter, change, result, env = process.env, now = new Date()) => {
  const to = env.DB_MIGRATION_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL;
  if (result.state === "already") return "No email sent (nothing changed this time).";
  const sender = pickSender(env);
  if (!sender) return "Email could NOT be sent (no valid sender address: set MAIL_FROM=name@domain in .env). The result above is still valid.";
  try {
    const ok = result.state === "applied";
    const when = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
    await transporter.sendMail({
      from: `SadhanaGPT <${sender}>`,
      to,
      subject: ok ? `[SadhanaGPT TEST] ${change.id} applied successfully` : `[SadhanaGPT TEST] ${change.id} FAILED - developer please check`,
      text: [
        ok ? `${change.id} (${change.title}) was applied successfully on the TEST database.` : `${change.id} (${change.title}) FAILED on the TEST database.`,
        "",
        result.message,
        ...(ok ? [] : [
          "",
          "WHAT WENT WRONG",
          `Step: ${result.step || "checks before the change"}`,
          `What it means: ${result.explanation || "The script stopped before changing anything; see the message above."}`,
          ...(result.technical ? [`Technical message (for the developer): ${result.technical}`] : []),
          "Each change is one statement where possible, so a failed change normally leaves the table as it was. Later DB changes were NOT run after this failure.",
        ]),
        "",
        `Time: ${when} IST`,
        `Database changed: ${env.DB_NAME || "(DB_NAME not set)"} (TEST, run after deploy by scripts/after-deploy-test.sh)`,
        ok ? "Next: check the feature on the test site and update DBnew.md (DONE-TEST)." : `Next: a developer should cross-check the database (see ${change.id} in DBnew.md), fix the cause above and deploy / run the step again. Use the Undo statement only if the change was made by mistake.`,
        "Developer: Manvatar Prabhu Ji",
      ].join("\n"),
    });
    return `Email sent to ${to}.`;
  } catch (err) {
    return `Email could NOT be sent (${err?.message || err}). The result above is still valid.`;
  }
};
