# DBnew - database change log

Every change to the database (structure or data) is written here: the exact query, why, the risk, and its status.
Claude never runs these. The developer runs them by hand and then fills in "Run on / Result".
Rule: do NOT alter the database unless it is required. Fix in app code first.

Developer: **Manvatar Prabhu Ji**
Database: `u451874010_prabhupada` (MariaDB 11.x), test server mirror first, then production.

Status values: `PENDING` (written, not run) | `DONE-TEST` | `DONE-PROD` | `SKIPPED`

---

## DB-001 | 2026-10-05 | Label the 5 default Chanting rules as 'system'

- **Status**: PENDING
- **Type**: data update (no structure change), 5 rows
- **Why**: 67 of the 72 default-scheme rules have `counsellor_id = 'system'`; the 5 Chanting rules (ids 1846, 1847, 1848, 1849, 1851) have it empty. Safety net so they match anything that looks for 'system' rules. The app code no longer depends on it (new schemes now copy rules through the default scheme itself), and nothing else in the code reads the label.
- **Check first** (expect 5 rows, `counsellor_id` NULL):
  ```sql
  SELECT id, counsellor_id FROM marking_rules WHERE scheme_id = 1 AND master_activity_id = 1;
  ```
- **Query**:
  ```sql
  UPDATE marking_rules SET counsellor_id = 'system'
  WHERE scheme_id = 1 AND master_activity_id = 1 AND counsellor_id IS NULL;
  ```
- **Expected result**: 5 rows changed.
- **Risk**: very low (only those 5 rows).
- **Undo**:
  ```sql
  UPDATE marking_rules SET counsellor_id = NULL WHERE id IN (1846,1847,1848,1849,1851);
  ```
- **Run on / Result**: _(developer to fill in)_

## DB-002 | 2026-10-05 | A person's own (personal) marking scheme

- **Status**: PENDING (needed only for the "my own marking scheme" feature, for students AND counsellors)
- **Type**: structure change, one new nullable column on `users` (no existing data changes)
- **Why**: today a scheme can only be allotted to a group or sub-group (`center_list.marking_scheme_id`, `labels_list.marking_scheme_id`). There is nowhere to say "use THIS scheme for me alone". The scheme itself is stored in the existing `marking_schemes` / `marking_rules` tables (owner = the person's user_id), so only the pointer is new. Rule used by the app: sub-group scheme set by a counsellor, else group scheme set by a counsellor, else the person's own scheme, else the default scheme. A counsellor's allotment therefore overrides the personal scheme without deleting it.
- **Check first** (expect 0 rows, and `marking_schemes` must show a PRIMARY KEY on `id`):
  ```sql
  SHOW COLUMNS FROM users LIKE 'personal_marking_scheme_id';
  SHOW CREATE TABLE marking_schemes;
  ```
- **Query**:
  ```sql
  ALTER TABLE `users`
    ADD COLUMN `personal_marking_scheme_id` BIGINT(20) NULL DEFAULT NULL AFTER `top_ranker_to`,
    ADD KEY `idx_users_personal_scheme` (`personal_marking_scheme_id`),
    ADD CONSTRAINT `fk_users_personal_scheme` FOREIGN KEY (`personal_marking_scheme_id`)
      REFERENCES `marking_schemes` (`id`) ON DELETE SET NULL;
  ```
- **Expected result**: 416 rows (all users) kept, new column NULL everywhere. Nothing changes for anyone until a person picks a scheme for themselves.
- **Risk**: low. Nullable column, no default value to fill, table is small. The foreign key makes deleting a scheme automatically clear it from the people using it (same style as the existing `fk_user_label`). Run on the test database first.
- **Undo**:
  ```sql
  ALTER TABLE `users`
    DROP FOREIGN KEY `fk_users_personal_scheme`,
    DROP KEY `idx_users_personal_scheme`,
    DROP COLUMN `personal_marking_scheme_id`;
  ```
- **Code that needs it**: the new backend code is safe to deploy before OR after this change (until the column exists, a personal scheme is simply ignored and "Use for me" answers "not switched on yet"). The feature switches on by itself within about a minute of the column existing, no restart.
- **Automatic way (TEST database only)**: runs by itself after each test deploy through `scripts/after-deploy-test.sh` (see "Automatic run after deploy" below). Its change script is `scripts/db-changes/DB-002-personal-marking-scheme.js`. It checks first, runs the one ALTER above, checks the result and emails `md.gkg.sp@gmail.com` "applied" or "FAILED" (with a plain-English explanation of the error). Safe to run twice (second time: "already applied", no email). For production keep running the SQL by hand.
- **Run on / Result**: _(developer to fill in)_

## DB-003 | 2026-10-05 | Automation self-test table (TEST database only, throwaway)

- **Status**: PENDING (a test of the after-deploy automation; not needed by any feature)
- **Type**: structure change, creates ONE new empty table `db_dependency_selftest`. No existing table or data is touched.
- **Why**: DB-002 is already applied, so it cannot show the full chain again. This is a harmless new numbered change to prove that a new file is picked up after a deploy, created, and reported by email. It has the same 17 columns as the app's real `db_dependency` table (story / book price / developer contact / payment key settings) but under another name, so the real table is never touched or dropped.
- **Query** (run by `scripts/db-changes/DB-003-automation-selftest.js`; the script skips it if the table already exists, and never drops anything): `CREATE TABLE db_dependency_selftest (...)`, same columns as `db_dependency`, see the script.
- **Expected result**: one new empty table with 17 columns; an email "DB-003 applied successfully" to md.gkg.sp@gmail.com.
- **Risk**: very low. New unused table, no data.
- **Undo** (do this when the test is finished):
  ```sql
  DROP TABLE db_dependency_selftest;
  ```
  Then retire the script: delete `scripts/db-changes/DB-003-automation-selftest.js` in a new commit (the number DB-003 stays used here and is never reused). If it is left in place, the next deploy would create the table again.
- **Run on / Result**: _(developer to fill in)_

## Automatic run after deploy (TEST server only)

One fixed file does it: `scripts/after-deploy-test.sh`. It is set up ONCE in `deploy.sh` on the server and is never edited again. It runs only inside a folder named `test-backend` (refuses anywhere else), needs `.env` and `node`, runs every change in `scripts/db-changes/` in number order, and logs to `~/db-changes.log`. Exit 0 = fine, 1 = a change failed (email explains), 2 = wrong place / setup problem.

**One-time setup** (add after the line in `deploy.sh` that restarts the test backend):
```bash
bash ~/test-backend/scripts/after-deploy-test.sh || echo "DB changes need a developer: see email and ~/db-changes.log"
```
The `|| echo ...` keeps a failed database change from stopping the deploy (the new code works without the new database changes).

### Rules for database change scripts (every new change)
1. **Name**: `DB-<3+ digit number>-<short-words-with-dashes>.js` in `scripts/db-changes/`, e.g. `DB-003-add-xyz-column.js`. Lowercase letters, digits and dashes only.
2. **Number**: the next free number, the same number as its entry in this file (`DB-003`). Numbers only go up and are never reused. They run in number order.
3. **Content**: copy `DB-002-personal-marking-scheme.js` and change only the change itself. It exports `change` with `id` (same as the number in the file name), `title`, `check`, `apply`, `verify` (and optional `precheck`). `check` must say "already applied" when the change is already there, so running twice is harmless.
4. **Never edit or rename a script after it has run anywhere.** To fix a mistake, add a new, higher-numbered script.
5. **One change per script**, one statement where possible (a single ALTER either fully works or changes nothing).
6. **Log it here first**: write the DB entry (what, why, expected result, risk, undo) in this file, then add the script. Fill in "Run on / Result" afterwards.
7. **If one fails**: it emails the explained error and stops; later changes do not run until a developer fixes it. A wrong name, a duplicate number or an id that does not match the file name also stops the run with an email.
8. **Production**: these scripts are for the TEST database only. Production changes stay manual (SQL run by the developer).

---

## Written earlier, NOT required now (kept for reference only)

These are in `migrations/` and were written on 2026-10-05 after analysing the mirror database.
Nothing in them has to be run for the app to work. Run only if a real need appears.

| Ref | File | What it is | Status |
|---|---|---|---|
| DB-R1 | `migrations/2026-10-05_001_safe_indexes_and_migration_log.sql` | 15 speed-up indexes + a log table. No data change. Rollback: `2026-10-05_001_rollback.sql` | PENDING (not required) |
| DB-R2 | `migrations/2026-10-05_002_review_first_data_fixes_and_constraints.sql` | Read-only checks, repair of marking rule 2191, `activities` id 8 owner `''` to NULL, CHECK rules on `marking_rules`, UNIQUE on `fix_activities.activity_id`. One step at a time. | PENDING (not required) |

Note: the empty owner on activity 8 and the broken rule 2191 are now handled in app code or by re-saving the scheme from the screen, so DB-R2 steps 3 and 4 are optional.

---

## How to add a new entry

Copy the DB-001 block, give it the next number (DB-002, ...), and fill in: date, what and why, check query, query, expected result, risk, undo. Status starts as `PENDING`.
