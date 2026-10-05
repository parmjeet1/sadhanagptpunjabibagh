-- =====================================================================
-- Rollback for migration 001 (2026-10-05)  -  Developer: Manvatar Prabhu Ji
-- Removes the indexes it added. The data is untouched either way.
-- The log table `schema_migrations` is KEPT on purpose (it is the audit trail);
-- a rollback row is added to it.
-- =====================================================================

ALTER TABLE `daily_report`
  DROP INDEX IF EXISTS `idx_dr_user_date`,
  DROP INDEX IF EXISTS `idx_dr_user_activity_date`;
ALTER TABLE `fix_activities`      DROP INDEX IF EXISTS `idx_fa_user_master`;
ALTER TABLE `user_assignments`
  DROP INDEX IF EXISTS `idx_ua_center`,
  DROP INDEX IF EXISTS `idx_ua_label`;
ALTER TABLE `user_counsellors`    DROP INDEX IF EXISTS `idx_uc_counsellor`;
ALTER TABLE `notifications`       DROP INDEX IF EXISTS `idx_notif_panel_receive_status`;
ALTER TABLE `push_subscriptions`  DROP INDEX IF EXISTS `idx_ps_user`;
ALTER TABLE `labels_list`
  DROP INDEX IF EXISTS `idx_labels_center`,
  DROP INDEX IF EXISTS `idx_labels_counsellor`;
ALTER TABLE `center_list`         DROP INDEX IF EXISTS `idx_center_counsellor`;
ALTER TABLE `users`
  DROP INDEX IF EXISTS `idx_users_center`,
  DROP INDEX IF EXISTS `idx_users_type`;

-- Put the old comment back
ALTER TABLE `activities`
  MODIFY `status` TINYINT(4) DEFAULT 1
  COMMENT '0=disabled,1=active,2=mentor_selectable';

INSERT IGNORE INTO `schema_migrations` (`migration_name`, `description`, `statements`)
VALUES (
  '2026-10-05_001_rollback',
  'Rolled back migration 001: indexes dropped, activities.status comment restored.',
  'DROP INDEX on daily_report, fix_activities, user_assignments, user_counsellors, notifications, push_subscriptions, labels_list, center_list, users | MODIFY activities.status COMMENT (old text)'
);
