// Shared by the database-backed tests of the Reading + Lectures feature.
// Talks to a THROWAWAY local MariaDB through its command-line client (never a real database).
// Only used when READING_TEST_SOCKET is set (the socket of a disposable local server).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const SOCK = process.env.READING_TEST_SOCKET;
const DBN = `reading_test_${process.pid}`;
const FEATURE = new URL("../../SadhanaGPT/reading-lecture-feature/", import.meta.url);

export const cli = (sql, dbName = DBN) => {
  const args = ["-S", SOCK, "-uroot", "--default-character-set=utf8mb4", "--batch"];
  if (dbName) args.push(dbName);
  const r = spawnSync("mariadb", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`SQL failed: ${r.stderr}\n${sql.slice(0, 300)}`);
  return r.stdout;
};
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`);
const fill = (sql, p = []) => { let i = 0; return sql.replace(/\?/g, () => lit(p[i++])); };
const unesc = (s) => s.replace(/\\(t|n|\\)/g, (_, c) => ({ t: "\t", n: "\n", "\\": "\\" })[c]);
// minimal stand-in for the mysql2 pool: query(sql, params) -> [rows] for SELECT, [{insertId, affectedRows}] otherwise
export const fakeDb = {
  async query(sql, params) {
    const text = fill(sql, params);
    if (/^\s*select/i.test(text)) {
      const lines = cli(text).split("\n").filter((l) => l !== "");
      if (!lines.length) return [[]];
      const cols = lines[0].split("\t");
      return [lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v === "NULL" ? null : /^-?\d+$/.test(v) ? Number(v) : unesc(v)])))];
    }
    const out = cli(`${text}; SELECT LAST_INSERT_ID() AS id, ROW_COUNT() AS n;`).trim().split("\n");
    const [id, n] = out[out.length - 1].split("\t").map(Number);
    return [{ insertId: id, affectedRows: n }];
  },
};
export const call = async (handler, userId, body = {}) => {
  const out = {};
  await handler({ user: userId ? { user_id: userId } : undefined, body, query: {} }, { json: (x) => { out.v = x; } });
  return out.v;
};


/** Creates the temporary database with made-up users, the new tables and the default book list. */
export const createBaseDb = () => {
  cli(`DROP DATABASE IF EXISTS ${DBN}; CREATE DATABASE ${DBN} CHARACTER SET utf8mb4;`, "");
  cli(`
    CREATE TABLE users (user_id VARCHAR(20) PRIMARY KEY, user_type VARCHAR(20)) ENGINE=InnoDB;
    CREATE TABLE user_assignments (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(20), center_id BIGINT, label_id BIGINT, counsellor_id VARCHAR(20)) ENGINE=InnoDB;
    CREATE TABLE user_counsellors (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(20), counsller_id VARCHAR(20), counsllor_type VARCHAR(20)) ENGINE=InnoDB;
    INSERT INTO users VALUES ('C1','counsellor'),('C2','counsellor'),('S_none','student'),('S_sub','student'),('S_grp','student'),('S_all','student'),('S_prim','student'),('S_other','student');
    INSERT INTO user_assignments (user_id, center_id, label_id, counsellor_id) VALUES
      ('S_sub', 5, 9, 'C1'), ('S_grp', 5, 2, 'C1'), ('S_all', 7, 3, 'C1'), ('S_prim', NULL, NULL, ''), ('S_other', 5, 9, 'C2');
    INSERT INTO user_counsellors (user_id, counsller_id, counsllor_type) VALUES ('S_prim','C1','primary');
  `);
  cli(readFileSync(new URL("DB-PROPOSAL.sql", FEATURE), "utf8"));
  cli(readFileSync(new URL("DB-SEED-DEFAULT.sql", FEATURE), "utf8"));
};

export const dropDb = () => { if (SOCK) cli(`DROP DATABASE IF EXISTS ${DBN};`, ""); };
