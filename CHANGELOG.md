# Changelog - SadhanaGPT Backend

## 2026-10-05, 10:57 AM IST - Change

- **Developer**: Manvatar Prabhu Ji
- **What changed**: "Reading Srila Prabhupada Book" is added to the student/counsellor pick-list (the fixed list is now 15 activities). It is listed right after "Reading(MIN)". It counts as a different activity from "Reading(MIN)", so having one never hides the other, and someone who already has it (by activity or by name) is not offered it again. No database change.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js`, `CHANGELOG.md`
- **Tested**: ran the pick-list filtering on all 64 students of the mirror database: it is offered to 59 of them (the 5 who already have it are skipped), nobody is offered a standard activity they already have under another spelling. Not run against a live server.
- **Frontend**: no change needed.

## 2026-10-05, 10:56 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: "Reading Srila Prabhupada Book" (activity 8, a built-in) was missing from every counsellor's Custom Activities list (both "Already added" and "Available"). Its owner field holds an empty text instead of nothing, and the list only accepted "nothing" or the counsellor's own id. The list now also accepts the empty text. Other counsellors' custom activities stay hidden. No database change.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js`, `CHANGELOG.md`
- **Tested**: on the mirror database's activity list the old condition hides activity 8 and the new one shows it (15 rows instead of 14); another counsellor's custom activity is still hidden. Not run against a live server.
- **Frontend**: no change needed. Not changed: the marking-scheme editor's activity list has the same empty-owner problem (`getSchemeActivitiesList`).

## 2026-10-05, 10:48 AM IST - New (redo of the reverted pick-list)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The "Add custom activity" pick-list API is back (`GET /addable-activities`, `POST /add-selected-activities`) with the problems found in the mirror database fixed. (1) It now reads activities with status 1, 2 AND 3. Before it skipped status 2, so Mangal Aarti Attended, Reading Misc. Books, Hearing Spiritual Master, Hearing Srila Prabhupada, Menial Services and Shloka Memorisation could never be offered. (2) "Already has it" now also recognises the other spellings people really use ("Wakeup time", "Sleeping time", "Mangal Arti", "Study Hours(Hrs)", "Book Reading" and similar) for the standard activities only; a counsellor's custom activity is hidden only on an exact name match. (3) "Book Distribution Time" is NOT added (it would need a database insert; a custom "Book distribution" already exists and is offered through the counsellor's custom list). The list is the 14 standard activities in a fixed order, then the person's own counsellor's custom activities. Adding writes only to the person's own list (`fix_activities`), never to the group's list. No database change.
- **Tested**: ran the same filtering on all 64 students of the mirror database: Hearing Spiritual Master is offered to 54 of them, no student is offered a standard activity they already have under another spelling, a custom "Reading Club" is not hidden by "Reading". Not run against a live server (no database server here).
- **Files touched**: `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js` (new), `routes/Routes.js`, `CHANGELOG.md`
- **Frontend**: the matching pick-list screen is committed in the frontend repo (no logic change there). Not touched here: the counsellor's "Already added" list rule (next task).

## 2026-10-05, 10:31 AM IST - Database (migration files, NOT yet run)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Analysed the mirror copy of the production database (structure first; the data is test data) and wrote migration files for the developer to run by hand. Nothing was run by Claude. Main findings: (1) activities.status has four values (0 off, 1 built-in, 2 mentor selectable, 3 counsellor custom) but the old pick-list only read 1 and 3, so the six status-2 activities (Mangal Aarti Attended, Reading Misc. Books, Hearing Spiritual Master, Hearing Srila Prabhupada, Menial Services, Shloka Memorisation) could never be offered; (2) marking rule 2191 (scheme "New2", Chanting) was saved corrupted (frequency empty, value ">= "), so the marks code ignored it and fell back to the default scheme's 25 marks instead of 20; (3) activity id 8 has an empty-text owner, hiding it from every counsellor list; (4) no foreign keys and some leftover rows: 67 daily entries with no activity, 17 with no user, 19 same-day duplicates, 14 students with a duplicate activity copy, 15 of 34 group assignments pointing at a deleted sub-group; (5) the activity-code trigger builds codes from MAX(id)+1, so codes can be re-used and can race.
- **Migration 001 (safe, adds only, repeatable)** - ALTER queries logged here:
  `CREATE TABLE IF NOT EXISTS schema_migrations (...)` (a log table inside the database)
  `ALTER TABLE daily_report ADD INDEX idx_dr_user_date (user_id, activity_date), ADD INDEX idx_dr_user_activity_date (user_id, activity_id, activity_date)`
  `ALTER TABLE fix_activities ADD INDEX idx_fa_user_master (user_id, master_activity_id)`
  `ALTER TABLE user_assignments ADD INDEX idx_ua_center (center_id), ADD INDEX idx_ua_label (label_id)`
  `ALTER TABLE user_counsellors ADD INDEX idx_uc_counsellor (counsller_id)`
  `ALTER TABLE notifications ADD INDEX idx_notif_panel_receive_status (panel_to, receive_id, status)`
  `ALTER TABLE push_subscriptions ADD INDEX idx_ps_user (user_id)`
  `ALTER TABLE labels_list ADD INDEX idx_labels_center (center_id), ADD INDEX idx_labels_counsellor (counsellor_id)`
  `ALTER TABLE center_list ADD INDEX idx_center_counsellor (counsller_id)`
  `ALTER TABLE users ADD INDEX idx_users_center (center_id), ADD INDEX idx_users_type (user_type)`
  `ALTER TABLE activities MODIFY status TINYINT(4) DEFAULT 1 COMMENT '0=disabled,1=built-in (all students),2=mentor_selectable,3=counsellor custom'` (comment only)
- **Migration 002 (review first, run one step at a time)** - read-only checks, then: `UPDATE marking_rules` (repair id 2191), `UPDATE activities SET counsellor_id = NULL WHERE id = 8`, `ALTER TABLE marking_rules ADD CONSTRAINT chk_rule_frequency / chk_rule_value_clean (CHECK)`, `ALTER TABLE fix_activities ADD UNIQUE KEY uk_fa_activity_id (activity_id)`. Optional and commented out: unique keys on fix_activities and daily_report (after duplicates are cleaned), a safer activity-code trigger, and changing counselor_added_activities.master_activity_id to BIGINT.
- **Each migration also writes one row to the new `schema_migrations` table**, so the database keeps its own record of structure changes.
- **Files touched**: `migrations/2026-10-05_001_safe_indexes_and_migration_log.sql`, `migrations/2026-10-05_001_rollback.sql`, `migrations/2026-10-05_002_review_first_data_fixes_and_constraints.sql`, `CHANGELOG.md`
- **Frontend**: no change needed for these files. Note for later work: the pick-list must also read activities with status 2.
- **Tested**: logic replayed against the dump data (the new CHECK rules pass every rule once row 2191 is repaired, activity codes are unique). Not run on a real MariaDB server (none available here), so run on the TEST database first.

## 2026-10-04, 7:42 PM IST - Revert

- **Developer**: Manvatar Prabhu Ji
- **What changed**: On the developer's request, ALL of today's afternoon changes were undone with new "revert" changes (history was not rewritten): the custom-marking-scheme marks fix, recalculating today's marks when a scheme is allotted, the add-activity pick-list (fixed list, own counsellor's customs, alternate-name check), and the "marks use the same scheme shown to the student" fix. The code is back to how it was before these changes. The earlier entries below are kept for the record. The unpublished "Book Distribution Time" change was dropped (it had not been pushed).
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js` (removed), `SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js`, `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js` (removed), `SadhanaGPT/Mentors/CounslerController.js`, `SadhanaGPT/Student/Controllers/StudentController.js`, `routes/Routes.js`, `CHANGELOG.md`
- **Frontend**: the pick-list screen needs its own revert (the `/addable-activities` calls would fail otherwise). No database change. Marks already saved while the fixes were live are not changed back.

## 2026-10-04, 4:45 PM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The "add activity" pick-list still offered activities the person already had under a slightly different name (for example "Wake Up Time" while the dashboard had "Wakeup time"), because names were compared letter for letter. The "already has it" check now ignores capitals, spaces and brackets, and treats the usual alternate names as one activity (wakeup / wake up time, sleep time, mangal aarti (attended), day rest (min), hearing (min), reading / reading (min) / book reading, chanting / japa). The same check protects adding, so duplicates cannot be created.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database change.

## 2026-10-04, 6:10 PM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Marks were worked out with a different scheme than the one shown to the student. The "Applied Marking Scheme" screen and "Possible Marks" treat a sub-group that only carries the DEFAULT scheme as "use my group's scheme", but saving marks (in the app and by WhatsApp) let that default hide the group's custom scheme. Result: a student of such a sub-group saw the new scheme (e.g. chanting max 20) but earned the default scheme's marks (25). There is now ONE shared rule (`resolveEffectiveSchemeId`): the sub-group's own custom scheme, else the group's scheme, else the default. It is used when saving marks, when recalculating today's marks after a scheme is allotted, and in the counsellor and student reports' "max possible" columns.
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js`, `SadhanaGPT/Mentors/CounslerController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change. Marks saved before this fix change only when the entry is saved again or a scheme is allotted / saved again (today's entries are then recalculated).

## 2026-10-04, 5:40 PM IST - Change

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The "Add custom activity" pick-list now also shows the custom activities made by the person's OWN counsellor (their primary counsellor; a counsellor sees the ones they made themselves), after the fixed standard activities and in A to Z order. Customs of any other counsellor are still never shown or added, even if their id is sent directly. Activities the person already has are still left out.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change.

## 2026-10-04, 5:30 PM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The "Add custom activity" pick-list now offers ONLY this fixed list of 14 standard activities (names matched ignoring capitals, spaces and punctuation): Sleep Time, wake up time, Chanting Completion Time, chanting, Mangal Aarti Attended, day rest(min), hearing(min), reading(min), Reading Misc. Books, hearing spiritual master, hearing srila prabhupada, menial services, Shloka Memorisation, Study Hours(MIN). Anything else (other counsellors' custom activities, Hearing Miscellaneous, etc.) is never shown or added, even if its id is sent directly. Each name appears once (a built-in wins over a custom copy of the same name) and the list is in a fixed order. Activities the person already has are still left out. "Chanting" is treated as the "Japa Number of Rounds" activity of the marking scheme, so there is no second Japa entry.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change.

## 2026-10-04, 4:30 PM IST - New feature

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Pick-list for "Add custom activity", for students and for counsellors (for their own list only).
  - New list `GET /addable-activities`: every built-in activity plus every counsellor's available custom activity (one shared pool), leaving out activities the person already has (same activity or same name). Supports `search_text`.
  - New `POST /add-selected-activities` (`master_activity_ids`): adds the chosen activities to the person's own list straight away. Repeated taps or a stale screen cannot create duplicates. The marks follow the person's marking scheme like any other activity. The person is taken from the login token.
  - Counsellor "Custom Activities" screen: a built-in activity now shows as "Already added" for a group / sub-group only when EVERY student in it has the activity (before: at least one). One student adding an activity for themselves therefore does not make the whole group look added. Side effect: if one student removes a built-in for themselves, the group screen shows it under "Available" until it is assigned again.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/SelfAddActivitiesController.js` (new), `SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js`, `routes/Routes.js`, `CHANGELOG.md`
- **Frontend**: needs the matching change (pick-list above "Create your own" in the Add Custom Activity pop-up, for students and counsellors). No database structure change.

## 2026-10-04, 12:50 PM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: When a counsellor allots a marking scheme to a group or sub-group (new scheme, scheme edited, rules saved, or scheme removed so students go back to the default), today's already-saved entries of the affected students are now recalculated with the scheme that applies to them, so the new scheme counts straight away. Earlier days are not changed. If the new scheme has no rule for an activity, the default scheme's rule is used for that activity only. If the recalculation fails, the scheme still saves and the problem is written to the server log. Saving waits at most about 8 seconds for the recalculation (very large groups finish in the background), and the built-in default scheme is never recalculated this way.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js` (new), `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change.

## 2026-10-04, 12:30 PM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Marks are now worked out only from the marking scheme that applies to the student (their sub-group's scheme, else their group's scheme). Before, the student's custom scheme and the default scheme were mixed and the HIGHEST matching mark won, so a custom scheme that gave fewer marks than the default was ignored. The default scheme is still used as a fallback only when the custom scheme has no rules at all for that activity. Applies when a student logs sadhana in the app and when it is logged through WhatsApp.
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change. Marks already saved for past/today's entries are not changed by this fix (they only recalculate when the activity is saved again).

## 2026-10-04, 10:50 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Built-in activities (like chanting) are no longer always shown as "already added" on the counsellor Custom Activities screen. They now count as added only while at least one student in the selected group (or sub-group) really has them. After a counsellor removes one, it moves to "Available" (also after a page reload) and can be assigned again. A group with no students keeps built-ins as added. Custom activities work as before.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js`, `CHANGELOG.md`
- **Frontend**: no change needed (the matching frontend commit adds a red "+" chip right after removal). No database structure change.

## 2026-10-04, 09:40 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Fixed removing a custom activity from a group when "All Subgroups" is selected. Before, only the group-wide record was deleted, so activities that had earlier been added to specific sub-groups were removed from the students' screens but stayed listed as "already added" and never came back to "Available". Now, with no sub-group chosen, every sub-group's record for that group and activity is removed. Removing from one specific sub-group works as before. Same fix applied to the "remove several activities from group" route.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change.
