# Changelog - SadhanaGPT Backend

## 2026-10-04, 09:40 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Fixed removing a custom activity from a group when "All Subgroups" is selected. Before, only the group-wide record was deleted, so activities that had earlier been added to specific sub-groups were removed from the students' screens but stayed listed as "already added" and never came back to "Available". Now, with no sub-group chosen, every sub-group's record for that group and activity is removed. Removing from one specific sub-group works as before. Same fix applied to the "remove several activities from group" route.
- **Files touched**: `SadhanaGPT/Controllers/custom activities/AssingActvtiesController.js`, `CHANGELOG.md`
- **Frontend**: no change needed. No database structure change.
