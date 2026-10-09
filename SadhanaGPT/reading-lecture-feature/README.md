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
- `DB-PROPOSAL.sql`: new database tables (run by the developer, by hand, on the test database first - done on test on 2026-10-09).
- `DB-SEED-DEFAULT.sql`: the default reading list from the developer's PDF (54 books, 3 levels, English + Hindi). Run once.
- `readingRules.js`: small checks and date rules (no database needed).
- `ReadingStudentController.js` and `LectureStudentController.js`: Reading and Lectures endpoints for the logged-in person; `index.js` connects them to the database.

Reading endpoints (all need the usual Authorization key + accesstoken headers; the person always comes from the login token):

| Method + path | Body | What it does |
|---|---|---|
| GET `/api/reading/plan` | - | The reading list this person sees (levels > books, with his status, NEW badge, his own books, progress counts). |
| POST `/api/reading/book-status` | `book_id`, `status` (`not_started`/`ongoing`/`completed`/`skipped`), optional `date` (YYYY-MM-DD, not in the future) | Saves his status for a book. |
| POST `/api/reading/add-my-book` | `title`, optional `title_hi`, `author` (default Srila Prabhupada), `link`, `status` (default `ongoing`) | "Another book I am reading". |
| POST `/api/reading/remove-my-book` | `book_id` | Removes a book he added himself (not one that is in a reading list). |

Lectures endpoints (same headers; recommended lectures + the person's own log):

| Method + path | Body | What it does |
|---|---|---|
| GET `/api/lectures/plan` | - | The recommended lectures this person sees (ticked if heard, NEW badge) and his own log (newest first, includes lectures he typed in). |
| POST `/api/lectures/mark-heard` | `lecture_id`, optional `heard_on` (default today, not in the future) | Ticks a recommended lecture (title/speaker/link are copied into his log). |
| POST `/api/lectures/unmark-heard` | `lecture_id` | Un-ticks it. |
| POST `/api/lectures/add-my-lecture` | `title`, optional `speaker` (default Srila Prabhupada), `link`, `heard_on` | A lecture he typed in himself. |
| POST `/api/lectures/remove-my-lecture` | `log_id` | Removes a lecture he typed in himself. |

Which list a person sees: his counsellor's sub-group list, else group list, else the counsellor's "all mentees" list, else the system default.

Tests: `tests/readingRules.test.mjs` (always runs) and `tests/readingController.test.mjs` + `tests/lectureController.test.mjs` (run only when `READING_TEST_SOCKET` points to a throwaway local MariaDB; never use a real database).

Status: Reading and Lectures endpoints for the person himself are built. Still to build: counsellor endpoints (customise lists, see mentees' status, Excel upload).
