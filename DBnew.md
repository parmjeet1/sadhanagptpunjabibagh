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
