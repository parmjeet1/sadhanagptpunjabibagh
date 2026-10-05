# Changelog - SadhanaGPT Backend

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
