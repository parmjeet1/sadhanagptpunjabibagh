# Changelog - SadhanaGPT Backend

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
