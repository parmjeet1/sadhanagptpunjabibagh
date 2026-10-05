/**
 * Runs every numbered database change in scripts/db-changes/ in number order (TEST database only).
 *
 *     node scripts/db-changes/run-all.js --confirm-test        (normally started by scripts/after-deploy-test.sh)
 *
 * File rules (see "Rules for database change scripts" in DBnew.md):
 *   - name:  DB-<3+ digit number>-<short-words-with-dashes>.js   e.g. DB-003-add-xyz-column.js
 *   - exports `change` (see _helper.js); change.id must equal the number in the file name ("DB-003")
 *   - safe to run twice (the change checks first); numbers are never reused, files never edited once run
 * Behaviour: applied -> email; failed -> email with the explained error and STOP (later changes do not run);
 * already applied -> silent. Exit code 0 = fine, 1 = something failed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runChange, sendResultMail, explainError } from "./_helper.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NAME_RULE = /^DB-(\d{3,})-[a-z0-9]+(?:-[a-z0-9]+)*\.js$/;

/** Lists the change files in order. Returns { files:[{file,number,id}], problems:[text] } */
export const listChangeFiles = (dir = DIR) => {
  const files = [];
  const problems = [];
  const seen = new Map();
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/^DB-/i.test(file) || !file.endsWith(".js")) continue; // helper, runner, notes are not changes
    const m = NAME_RULE.exec(file);
    if (!m) { problems.push(`File name "${file}" breaks the naming rule (DB-003-short-words.js).`); continue; }
    const number = Number(m[1]);
    if (seen.has(number)) { problems.push(`Number ${m[1]} is used twice: "${seen.get(number)}" and "${file}".`); continue; }
    seen.set(number, file);
    files.push({ file, number, id: `DB-${m[1]}` });
  }
  files.sort((a, b) => a.number - b.number);
  return { files, problems };
};

/** Runs all changes with the given db / transporter. Returns { ok, results:[{id,state,message,mail}] }. */
export const runAll = async (db, transporter, { dir = DIR, log = console.log, env = process.env } = {}) => {
  const results = [];
  const { files, problems } = listChangeFiles(dir);

  const fail = async (id, message, step) => {
    const result = { state: "failed", message, step, explanation: "A developer must fix the file name / contents (see DBnew.md rules)." };
    const mail = await sendResultMail(transporter, { id, title: "database change files" }, result, env);
    log(`[${id}] FAILED: ${message}`); log(`[${id}] ${mail}`);
    results.push({ id, ...result, mail });
  };

  if (problems.length) { await fail("DB-files", problems.join(" "), "checking the change files"); return { ok: false, results }; }
  if (files.length === 0) { log("[DB] No change scripts found. Nothing to do."); return { ok: true, results }; }

  for (const f of files) {
    let change;
    try {
      const mod = await import(pathToFileURL(path.join(dir, f.file)).href);
      change = mod.change;
      if (!change || change.id !== f.id) throw new Error(`"${f.file}" must export a change whose id is "${f.id}".`);
    } catch (err) {
      await fail(f.id, `Could not load ${f.file}: ${err?.message || err}`, "loading the change file");
      return { ok: false, results };
    }
    const result = await runChange(db, change);
    log(`[${f.id}] ${result.state.toUpperCase()}: ${result.message}`);
    const mail = await sendResultMail(transporter, change, result, env);
    log(`[${f.id}] ${mail}`);
    results.push({ id: f.id, ...result, mail });
    if (result.state === "failed") return { ok: false, results }; // later changes may depend on this one
  }
  return { ok: true, results };
};

const main = async () => {
  if (!process.argv.includes("--confirm-test")) {
    console.error("Refusing to run: add --confirm-test to confirm this is the TEST database.");
    process.exit(1);
  }
  const { default: transporter } = await import("../../utils/emails/mailer.js");
  let db = null;
  let ok = false;
  try {
    ({ default: db } = await import("../../config/database.js"));
    console.log(`[DB] Target database: ${process.env.DB_NAME || "(DB_NAME not set)"} on ${process.env.DB_HOST || "(DB_HOST not set)"}`);
    ({ ok } = await runAll(db, transporter));
  } catch (err) {
    const result = {
      state: "failed",
      message: `Could not start the database changes: ${err?.message || err}`,
      step: "starting the script",
      technical: `${err?.code || "no code"}: ${err?.message || err}`,
      explanation: explainError(err),
    };
    console.log(`[DB] FAILED: ${result.message}`);
    console.log(`[DB] ${await sendResultMail(transporter, { id: "DB-changes", title: "start of database changes" }, result)}`);
  }
  if (db) await db.end().catch(() => {});
  process.exit(ok ? 0 : 1);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
