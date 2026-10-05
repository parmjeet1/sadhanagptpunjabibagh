-- =====================================================================
-- Migration 002 : REVIEW FIRST - data fixes + stricter rules
-- Date          : 2026-10-05
-- Developer     : Manvatar Prabhu Ji
-- Database      : u451874010_prabhupada  (MariaDB 11.x)
--
-- DO NOT RUN THIS FILE AS ONE BLOCK.
-- Run it one numbered step at a time, read the result, then go on.
-- Steps 1-2 are read-only (SELECT). Steps 3+ change data or structure.
-- Take a backup / use the TEST database first. Claude never runs these.
--
-- Found by analysing the mirror dump taken 2026-10-05 04:51 UTC.
-- Row counts quoted below are from that dump and will differ if data changed.
-- =====================================================================


-- =====================================================================
-- STEP 1 (read-only): confirm the findings on your database
-- =====================================================================

-- 1a. Broken marking rule(s): frequency not valid, or value not a plain value.
--     Dump: 1 row (id 2191, scheme 17 "New2", Chanting) -> frequency '', operator '=', value '>= '.
SELECT id, scheme_id, master_activity_id, frequency, condition_operator, condition_value, marks, updated_at
FROM marking_rules
WHERE frequency NOT IN ('daily','weekly','monthly')
   OR condition_value <> TRIM(condition_value)
   OR condition_value NOT REGEXP '^[A-Za-z0-9:. ]+$';

-- 1b. Master activity whose owner is '' instead of NULL (hidden from every counsellor list).
--     Dump: id 8 "Reading Srila Prabhupada Book".
SELECT id, name, status, counsellor_id FROM activities WHERE counsellor_id = '';

-- 1c. Students holding the same master activity twice. Dump: 14 pairs.
SELECT user_id, master_activity_id, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS fix_ids
FROM fix_activities
WHERE master_activity_id IS NOT NULL
GROUP BY user_id, master_activity_id
HAVING COUNT(*) > 1;

-- 1d. Daily entries that point at an activity that no longer exists. Dump: 67 rows (17 codes).
SELECT dr.activity_id, COUNT(*) AS rows_
FROM daily_report dr
LEFT JOIN fix_activities fa ON fa.activity_id = dr.activity_id
WHERE fa.activity_id IS NULL
GROUP BY dr.activity_id;

-- 1e. The same activity saved twice for the same student and day. Dump: 19 sets.
SELECT user_id, activity_id, activity_date, COUNT(*) AS copies, GROUP_CONCAT(id ORDER BY id) AS report_ids
FROM daily_report
GROUP BY user_id, activity_id, activity_date
HAVING COUNT(*) > 1;

-- 1f. Students placed in a sub-group that no longer exists. Dump: 15 of 34 assignments.
--     (Their marking scheme then silently falls back to the group's / default scheme.)
SELECT ua.id, ua.user_id, ua.center_id, ua.label_id
FROM user_assignments ua
LEFT JOIN labels_list l ON l.id = ua.label_id
WHERE l.id IS NULL;

-- 1g. Marking rules per activity in the default scheme: which master activities have NO rule?
--     Dump: 5 (Study Hours(MIN)) and 17 (Book distribution) have none -> they always earn 0.
SELECT a.id, a.name
FROM activities a
LEFT JOIN marking_rules r ON r.master_activity_id = a.id AND r.scheme_id = 1 AND r.status = 1
WHERE a.status IN (1,2,3) AND r.id IS NULL;


-- =====================================================================
-- STEP 2 (read-only): the activities.status values (why some activities
-- never showed in the student "add activity" list)
--   1 = built-in   2 = mentor selectable   3 = counsellor custom
-- The old pick-list only read status 1 and 3, so these six status-2
-- activities could never be offered: Mangal Aarti Attended,
-- Reading Misc. Books, Hearing Spiritual Master, Hearing Srila
-- Prabhupada, Menial Services, Shloka Memorisation.
-- (Fix is in the app code, no database change needed.)
-- =====================================================================
SELECT status, COUNT(*) AS activities, GROUP_CONCAT(name ORDER BY id SEPARATOR ' | ') AS names
FROM activities GROUP BY status;


-- =====================================================================
-- STEP 3 (DATA FIX): repair marking rule 2191
-- Cause: the scheme screen saved the Chanting rule with the operator inside
-- the value and an empty frequency. Because the frequency is not 'daily',
-- the marks code ignores this rule, so Chanting in scheme 17 silently fell
-- back to the default scheme (25 marks instead of 20).
-- The guard in WHERE makes it change that one broken row only.
-- NOTE: scheme 17 has no other Chanting bands (>=8, >=6, >=4, =0). Decide
--       with the counsellor whether to add them; this step only repairs the
--       one row, assuming the intended rule was ">= 16 -> 20 marks".
-- =====================================================================
UPDATE marking_rules
SET frequency = 'daily',
    condition_operator = '>=',
    condition_value = '16'
WHERE id = 2191
  AND scheme_id = 17
  AND master_activity_id = 1
  AND frequency = ''
  AND condition_value = '>= ';


-- =====================================================================
-- STEP 4 (DATA FIX): built-in activity owner '' -> NULL
-- Counsellor lists use  counsellor_id IS NULL OR counsellor_id = <me>,
-- so '' hides "Reading Srila Prabhupada Book" from every counsellor.
-- =====================================================================
UPDATE activities SET counsellor_id = NULL WHERE id = 8 AND counsellor_id = '';


-- =====================================================================
-- STEP 5 (STRUCTURE): stop broken marking rules being saved again
-- Run only after STEP 3 (the existing broken row would make this fail).
-- After this the database refuses a rule with a bad frequency or a value
-- like '>= ', so a screen bug can no longer write corrupt rules silently.
-- The app will then show an error instead of saving a wrong scheme.
-- =====================================================================
ALTER TABLE `marking_rules`
  ADD CONSTRAINT `chk_rule_frequency`
    CHECK (`frequency` IN ('daily','weekly','monthly')),
  ADD CONSTRAINT `chk_rule_value_clean`
    CHECK (`condition_value` = TRIM(`condition_value`)
           AND `condition_value` REGEXP '^[A-Za-z0-9:. ]+$');


-- =====================================================================
-- STEP 6 (STRUCTURE): activity codes must be unique
-- The code ('f00xxx') is the link between fix_activities and daily_report.
-- Today there are no duplicates (569 rows). With the trigger below
-- (MAX(id)+1) two simultaneous inserts could get the same code and mix
-- two students' marks; this makes the database refuse the second one.
-- =====================================================================
ALTER TABLE `fix_activities`
  ADD UNIQUE KEY `uk_fa_activity_id` (`activity_id`);


-- =====================================================================
-- STEP 7 (OPTIONAL, needs a decision): clean duplicates, then enforce
-- Only after you decided which copy to keep using the STEP 1c / 1e lists.
-- Never delete a fix_activities copy that daily_report rows still use:
-- move those daily_report rows to the kept copy's activity_id first.
-- Left commented on purpose.
-- =====================================================================
-- ALTER TABLE `fix_activities`
--   ADD UNIQUE KEY `uk_fa_user_master` (`user_id`, `master_activity_id`);
--   -- (rows with NULL master_activity_id = the student's own activities; they stay allowed)
-- ALTER TABLE `daily_report`
--   ADD UNIQUE KEY `uk_dr_user_activity_date` (`user_id`, `activity_id`, `activity_date`);
--   -- (works with the partitioning because activity_date is part of the key)


-- =====================================================================
-- STEP 8 (OPTIONAL, developer review): activity codes must never be re-used
-- The current trigger builds the code from MAX(id)+1, not from the row's real
-- id. In the dump 11 rows already differ (id 3 -> f00001, id 702 -> f00696).
-- If the newest rows are deleted, the next row can get a code that old
-- daily_report entries (17 orphan codes today) still carry, and those old
-- entries would attach to the new activity. Nothing collides today (the
-- orphan codes are all below the next code), so this is a safeguard.
-- The replacement uses the table's own next-id counter, like the existing
-- users trigger. Left commented for review.
-- =====================================================================
-- DROP TRIGGER IF EXISTS `trg_fix_activity_code_v2`;
-- DELIMITER $$
-- CREATE TRIGGER `trg_fix_activity_code_v2` BEFORE INSERT ON `fix_activities` FOR EACH ROW
-- BEGIN
--   DECLARE next_id BIGINT;
--   SELECT AUTO_INCREMENT INTO next_id FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fix_activities';
--   SET NEW.activity_id = CONCAT('f', LPAD(next_id, GREATEST(5, CHAR_LENGTH(next_id)), '0'));
-- END$$
-- DELIMITER ;


-- =====================================================================
-- STEP 9 (OPTIONAL, needs a code check first): same type on both sides of a join
-- counselor_added_activities.master_activity_id is VARCHAR(80) but
-- activities.id is BIGINT, so joins compare text with numbers and cannot
-- use the index well. All 25 values are plain numbers. Changing it makes the
-- driver return numbers instead of text for that column, so check the code
-- that compares it with === first. Left commented.
-- =====================================================================
-- ALTER TABLE `counselor_added_activities`
--   MODIFY `master_activity_id` BIGINT(20) NOT NULL;


-- =====================================================================
-- LOG: record what was actually run (edit the list to match the steps you ran)
-- =====================================================================
INSERT IGNORE INTO `schema_migrations` (`migration_name`, `description`, `statements`)
VALUES (
  '2026-10-05_002_review_first_data_fixes_and_constraints',
  'Repairs marking rule 2191, sets activities.id 8 counsellor_id NULL, adds CHECK constraints on marking_rules and UNIQUE on fix_activities.activity_id.',
  'UPDATE marking_rules id 2191 | UPDATE activities id 8 | ALTER marking_rules ADD CONSTRAINT chk_rule_frequency, chk_rule_value_clean | ALTER fix_activities ADD UNIQUE uk_fa_activity_id'
);
