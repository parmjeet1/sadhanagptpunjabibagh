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
- **Automatic way (TEST database only)**: after deploying the backend, run once on the server: `node scripts/apply-db-002.js --confirm-test`. It checks first, runs the one ALTER above, checks the result, prints it, and emails "applied" or "FAILED" to `DB_MIGRATION_NOTIFY_EMAIL` (set in the server's `.env`; if not set, no email, the screen output is the result). Safe to run twice (second run says "already applied"). It refuses to run without `--confirm-test`. On FAILED, nothing half-done is left by the script; a developer cross-checks and uses the Undo above only if needed. For production keep running the SQL by hand.
- **Run on / Result**: _(developer to fill in)_

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
