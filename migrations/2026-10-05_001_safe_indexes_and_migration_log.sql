-- =====================================================================
-- Migration 001 : safe, additive changes (indexes + migration log table)
-- Date          : 2026-10-05
-- Developer     : Manvatar Prabhu Ji
-- Database      : u451874010_prabhupada  (MariaDB 11.x)
--
-- WHO RUNS THIS: the developer, by hand (Claude never changes the database).
-- Run it on the TEST database first, check the app, then production.
--
-- WHAT IT DOES
--   * Creates a log table `schema_migrations` so every structure change is
--     recorded inside the database itself (see the INSERT at the bottom).
--   * Adds INDEXES only. No column, row or value is changed or removed.
--   * Fixes the documented meaning of activities.status (comment only).
--
-- SAFETY
--   * Every statement is repeatable: IF NOT EXISTS / INSERT IGNORE.
--   * Tables are tiny (largest: daily_report ~7.8k rows) so each ALTER is quick.
--   * Rollback: 2026-10-05_001_rollback.sql
--   * Code change needed: NONE (indexes are used automatically).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Log table: one row per migration, with the statements that ran
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `migration_name` VARCHAR(150) NOT NULL,
  `description`    VARCHAR(500) DEFAULT NULL,
  `statements`     MEDIUMTEXT   DEFAULT NULL,
  `applied_by`     VARCHAR(100) NOT NULL DEFAULT 'Manvatar Prabhu Ji',
  `applied_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_migration_name` (`migration_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 1. Indexes. Each one matches a query the backend really runs.
-- ---------------------------------------------------------------------

-- Dashboards / reports read one student's days: WHERE user_id = ? AND activity_date ...
-- (table is partitioned by activity_date, so the date in the index also helps pruning)
ALTER TABLE `daily_report`
  ADD INDEX IF NOT EXISTS `idx_dr_user_date`          (`user_id`, `activity_date`),
  ADD INDEX IF NOT EXISTS `idx_dr_user_activity_date` (`user_id`, `activity_id`, `activity_date`);

-- "does this student already have this master activity?" (assign / add / marks)
ALTER TABLE `fix_activities`
  ADD INDEX IF NOT EXISTS `idx_fa_user_master` (`user_id`, `master_activity_id`);

-- Student lists by group / sub-group: WHERE center_id = ? [AND label_id = ?]
ALTER TABLE `user_assignments`
  ADD INDEX IF NOT EXISTS `idx_ua_center` (`center_id`),
  ADD INDEX IF NOT EXISTS `idx_ua_label`  (`label_id`);

-- Mentee lists: WHERE counsller_id = ?   (the unique key starts with user_id, so it cannot help)
ALTER TABLE `user_counsellors`
  ADD INDEX IF NOT EXISTS `idx_uc_counsellor` (`counsller_id`);

-- Notification list / unread count: WHERE panel_to = ? AND receive_id = ? [AND status = ?]
ALTER TABLE `notifications`
  ADD INDEX IF NOT EXISTS `idx_notif_panel_receive_status` (`panel_to`, `receive_id`, `status`);

-- Push sending: WHERE user_id = ?
ALTER TABLE `push_subscriptions`
  ADD INDEX IF NOT EXISTS `idx_ps_user` (`user_id`);

-- Group / sub-group lookups by owner and by parent group
ALTER TABLE `labels_list`
  ADD INDEX IF NOT EXISTS `idx_labels_center`     (`center_id`),
  ADD INDEX IF NOT EXISTS `idx_labels_counsellor` (`counsellor_id`);

ALTER TABLE `center_list`
  ADD INDEX IF NOT EXISTS `idx_center_counsellor` (`counsller_id`);

-- Students of a group: WHERE center_id = ?   /  counsellor lists: WHERE user_type = ?
ALTER TABLE `users`
  ADD INDEX IF NOT EXISTS `idx_users_center` (`center_id`),
  ADD INDEX IF NOT EXISTS `idx_users_type`   (`user_type`);

-- ---------------------------------------------------------------------
-- 2. Documentation only (no data change): the real meaning of activities.status
--    0 = disabled, 1 = built-in (every student), 2 = mentor selectable,
--    3 = custom activity made by a counsellor.
--    (Same column definition as today, only the comment is corrected.)
-- ---------------------------------------------------------------------
ALTER TABLE `activities`
  MODIFY `status` TINYINT(4) DEFAULT 1
  COMMENT '0=disabled,1=built-in (all students),2=mentor_selectable,3=counsellor custom';

-- ---------------------------------------------------------------------
-- 3. Record this migration in the log table
-- ---------------------------------------------------------------------
INSERT IGNORE INTO `schema_migrations` (`migration_name`, `description`, `statements`)
VALUES (
  '2026-10-05_001_safe_indexes_and_migration_log',
  'Adds schema_migrations log table, 15 indexes, and corrects the activities.status comment. No data changed.',
  'CREATE TABLE schema_migrations | ADD INDEX daily_report(idx_dr_user_date, idx_dr_user_activity_date) | fix_activities(idx_fa_user_master) | user_assignments(idx_ua_center, idx_ua_label) | user_counsellors(idx_uc_counsellor) | notifications(idx_notif_panel_receive_status) | push_subscriptions(idx_ps_user) | labels_list(idx_labels_center, idx_labels_counsellor) | center_list(idx_center_counsellor) | users(idx_users_center, idx_users_type) | MODIFY activities.status COMMENT'
);

-- ---------------------------------------------------------------------
-- Check afterwards (read-only):
--   SHOW INDEX FROM daily_report;   SELECT * FROM schema_migrations;
-- ---------------------------------------------------------------------
