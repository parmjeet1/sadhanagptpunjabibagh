# Reading Lecture Feature

All new work for the **reading-lecture feature** goes in this folder.

- Developer: Manvatar Prabhu Ji
- Created: 2026-10-09
- This repo: `sadhanagptpunjabibagh` (branch `backend-test`)
- Matching folder in the other repo: `sadhanagptreactweb` -> `src/reading-lecture-feature`

Rules for this folder:
- New files for this feature are added here (not scattered in other folders). If the feature must change an existing shared file (for example routes), keep that change small and note it in `CHANGELOG.md`.
- If an API changes on the backend, the website folder needs the matching change, and the other way round (see CLAUDE.md, rule 8).
- Do not put keys, passwords or real student data in this folder.

Files here:
- `DB-PROPOSAL.sql`: proposed new database tables (NOT run; the developer runs it by hand on the test database first).
- `DB-SEED-DEFAULT.sql`: PLACEHOLDER default books/levels (not run; replace when the real default list arrives).

Status: design stage, no app code built yet.
