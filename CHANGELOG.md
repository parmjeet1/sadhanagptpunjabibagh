# Changelog - SadhanaGPT Backend

## 📚 [Reading Lecture Feature] - 2026-10-09, 05:25 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Added the Hindi names to `DB-SEED-DEFAULT.sql`, taken from the developer's "Hindi Only" PDF: a Hindi title for all 54 books and Hindi names for the 3 levels (स्तर 1/2/3 — श्रेणी 1/2/3). Hindi and English were matched by position (both lists have the same order and counts 22 / 15 / 17). English titles are unchanged.
- **Files touched**: `SadhanaGPT/reading-lecture-feature/DB-SEED-DEFAULT.sql`, `CHANGELOG.md`
- **Tested**: ran `DB-PROPOSAL.sql` then this file on a throwaway local database (not yours): 54 books, all 54 with a Hindi title, Hindi stored and read back correctly, level names correct. NOT run on your real database.
- **Frontend**: nothing needed now (the website preview still shows the old sample books).

## 📚 [Reading Lecture Feature] - 2026-10-09, 05:10 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Replaced the 7-book placeholder in `DB-SEED-DEFAULT.sql` with the real default reading list from the developer's PDF "Srila Prabhupada - Book Reading Plan": 54 books in 3 levels (Level 1 - Category I: 22 books, Level 2 - Category II: 15, Level 3 - Category III: 17), in the same order as the PDF. Hindi titles are left empty for now. No lectures added (list not supplied yet). The file has a clean-up block for anyone who already ran the old placeholder.
- **Files touched**: `SadhanaGPT/reading-lecture-feature/DB-SEED-DEFAULT.sql`, `CHANGELOG.md`
- **Tested**: ran `DB-PROPOSAL.sql` then this file on a throwaway local database (not yours): 54 books, 22 / 15 / 17 per level, order 1..N in each level. NOT run on your real database.
- **Frontend**: nothing needed now. The sample data in the website preview still shows the old placeholder books.

## 📚 [Reading Lecture Feature] - 2026-10-09, 03:45 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Updated the proposed database design after the developer's answers: (1) a book can now also be "skipped" (hidden) by a person; (2) Hindi titles (`title_hi`, level `name_hi`) for books, lectures and levels; (3) "added on" dates on plan books/lectures so recently added items can show a NEW badge; (4) a book a person adds for himself is a normal book row owned by him and shown only to him (and his counsellor in the status list). Added `DB-SEED-DEFAULT.sql` with PLACEHOLDER default data (7 Prabhupada books in 3 levels, Hindi titles only where certain; no lectures invented) so screens have something to show until the real list arrives.
- **Files touched**: `SadhanaGPT/reading-lecture-feature/DB-PROPOSAL.sql`, `SadhanaGPT/reading-lecture-feature/DB-SEED-DEFAULT.sql` (new), `SadhanaGPT/reading-lecture-feature/README.md`, `CHANGELOG.md`
- **Tested**: both files run cleanly one after the other on a throwaway local database (not yours); Hindi text stored and read back correctly; "skipped" saved; the placeholder data undo works. NOT run on your real database.
- **Frontend**: nothing yet.

## 📚 [Reading Lecture Feature] - 2026-10-09, 03:20 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Wrote the PROPOSED database design for the books + lectures feature in `SadhanaGPT/reading-lecture-feature/DB-PROPOSAL.sql` (8 new tables, no existing table changed). It has NOT been run on any real database: the developer runs it by hand, test database first. Also updated the folder README.
- **Files touched**: `SadhanaGPT/reading-lecture-feature/DB-PROPOSAL.sql` (new), `SadhanaGPT/reading-lecture-feature/README.md`, `CHANGELOG.md`
- **Tested**: ran the whole file on a throwaway local database (not yours) with a stand-in users table: all tables create, duplicate plans are refused, a mentee's plan lookup (sub-group, then group, then all mentees, then default) picks the right plan, deleting a plan removes its books, and the undo statement removes everything. NOT tested on your real database: please run the "CHECK FIRST" queries at the top of the file before running it.
- **Frontend**: nothing yet (screens are still being designed).

## 📚 [Reading Lecture Feature] - 2026-10-09, 02:45 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Created a new folder `SadhanaGPT/reading-lecture-feature/` (with a short README) where all new work for the reading-lecture feature will go. Nothing is built yet and no existing behaviour changes. A matching folder was made in the other repo (website `src/reading-lecture-feature/`).
- **Files touched**: `SadhanaGPT/reading-lecture-feature/README.md` (new), `CHANGELOG.md`
- **Tested**: not needed (no code); the folder is not used by anything yet.
- **Frontend**: no change needed.

## 🔔 [Notifications] - 2026-10-08, 09:37 AM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Two push notifications were switched off. (1) The daily 9:00 AM "your N-day average fell below target" alert to students is gone; the other 9:00 AM alert ("We Miss You! - no activity logged for N days") still works. (2) The daily 9:15 AM "Mentee Alerts - you have X mentees who need attention" push to counsellors is no longer scheduled. The mentor-alert code is left in the file (not deleted) so it can be turned back on by adding one schedule line.
- **Files touched**: `SadhanaGPT/cronjobs/WebPushNotification.js`, `CHANGELOG.md`
- **Tested**: file loads without errors (syntax check) and the 382 automatic checks pass. NOT tested: the live cron jobs (they only run on the server); after deploy, confirm the log shows no 9:15 AM mentor job and no "Activity Alert" pushes.
- **Frontend**: no change needed.

## 🤖 [Chatbot] - 2026-10-07, 05:35 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: (1) Misspelled day words are now understood. A student typed "Cal ki chanting 3" (meaning "kal"): no day was found, so the entry would have been saved for TODAY instead of yesterday. Now "cal", "kl", "caal" (only when followed by ki/ka/ke/ko/ne/me/mein/tak, or at the start of the message), "kaal", "kall", and the typos "yesterdy", "yestarday", "yesturday", "yestrday", "parsso", "paraso", "parsu", "parsoo", "parsho" are read as yesterday / the day before. Things like "chanting 3 cal" or "200 cal burnt" are NOT taken as a day. (2) The OpenAI prompt (`utils/openaiService.js`) now tells the AI: the same misspelled day words mean kal/parso; only fill an activity the message really talks about (so "chanting 3" is the round count only, not also the completion time); a time activity gets only a clock time, a yes/no activity only yes/no, a number activity only a number; and if the message is about an activity that is not in the list, answer "unrecognized" instead of picking a similar one.
- **Files touched**: `utils/assistantDate.js`, `utils/openaiService.js`, `tests/assistantDate.test.mjs`, `CHANGELOG.md`
- **Tested**: 382 automatic checks pass (27 new for the spellings, including cases that must NOT count as a day); the 3,000-sentence test still shows 0 wrong answers. NOT tested: the new OpenAI prompt wording (no OpenAI key here), so please try "Cal ki chanting 3" and a message about a missing activity with "Ask AI to re-check" on the test site. The server-side check of OpenAI's values by type (fix 3) is not done yet.
- **Frontend**: no change needed.

## 🤖 [Chatbot] - 2026-10-07, 05:45 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: When a student mentions an activity they do not have (for example "study 25 minute" with no Study activity, or "chanting poori hui 2 baje" with no Chanting Completion Time), the chatbot now answers by itself instead of sending the message to OpenAI: "I understood this as Study, but it isn't in your sadhana list, so I can't save it. Your activities: ... If you think I got this wrong, tap 'Ask AI to re-check'." It does this only when it is sure: the message is read again with pretend versions of the activities the student lacks, and it must understand the WHOLE message that way (nothing left over or unclear). Anything less sure still goes to OpenAI. A student whose activity NAME looks like the kind (e.g. "Study Hours") is never told it is missing. If a message mixes real and missing activities ("16 rounds, study 30 min"), the real part comes back as normal updates for confirmation, plus a `missing` list. The "Ask AI to re-check" button (forced AI) skips this check, so the student can ask OpenAI once. New answer type: `intent: "missing_activity"` with `missing` (names) and `clarification` (the sentence).
- **Files touched**: `utils/assistantMissing.js` (new), `SadhanaGPT/Student/Controllers/AssistantController.js`, `tests/assistantMissing.test.mjs` (new), `CHANGELOG.md`
- **Tested**: 362 automatic checks pass (7 new). On 3,000 made-up messages with one activity removed from the list (completion time, day rest, hearing, reading, sleep, wake-up, mangal aarti): all messages about the removed activity (about 160 to 660 each) were answered correctly and 0 were wrongly claimed; the 3,000-sentence accuracy test still shows 0 wrong answers. NOT tested: live server/database/OpenAI.
- **Frontend**: needs the matching change in the website repo: show the answer of type `missing_activity` with an "Ask AI to re-check" button, and show a note when `missing` comes with normal updates. Until then, the website shows the sentence as a normal message (without the button), so deploy both together.

## 🤖 [Chatbot] - 2026-10-07, 05:00 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: New API `GET /assistant/marks/by-date/:date` (for example `/assistant/marks/by-date/2026-10-06`). It gives the marks for a past day in the same shape as today's marks (marks, maxMarks, previous day's marks, activities recorded, total activities), so the chat can show marks after an entry for "kal". It only reads data and changes nothing. Bad dates, future dates and dates older than a year are refused with a 422 message. Today's marks API works as before; both now use one shared calculation, which is the same marks engine the dashboard uses. Needs deploying to the server for the website change to work.
- **Files touched**: `SadhanaGPT/Student/Controllers/AssistantController.js`, `routes/Routes.js`, `CHANGELOG.md`
- **Tested**: syntax check passes on both files; the 355 existing automatic checks still pass. NOT tested: the new API itself against a real database (no database here), so please try `/assistant/marks/by-date/<yesterday>` once with a student login after deploying. No database change is needed.
- **Frontend**: needs the matching change (`getMarksForDate` in the adapter and the chat), done in the website repo.

## 🤖 [Chatbot] - 2026-10-07, 03:45 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: (1) When the OpenAI step fails, the chatbot now says "OpenAI is taking time. Please try with another phrase, e.g. '16 rounds, 30 min hearing, woke at 4:25'." instead of "Something went wrong understanding that...". (2) Chanting completion time was checked in English, Hinglish and Hindi ("chanting poori hui 2 baje", "16 rounds 2 baje poore hue", "japa 2 pm tak complete", "mala poori 10:30 baje raat", "चैंटिंग 2 बजे पूरी हुई", "chanting khatam kiya 11 baje raat ko"); it already worked, now covered by tests. One gap fixed: "12 baje" is only saved as 12:00 noon when the message says dopahar/noon, as 00:00 when it says raat/night, and otherwise goes to OpenAI, because it could mean either. Note: a student who has no "Chanting Completion Time" activity still goes to OpenAI for such a message, since there is nowhere to save it.
- **Files touched**: `SadhanaGPT/Student/Controllers/AssistantController.js`, `utils/assistantParser.js`, `tests/assistantParser.test.mjs`, `CHANGELOG.md`
- **Tested**: 355 automatic checks pass (14 new); the 3,000-sentence test still has 0 wrong answers; controller syntax check passes. NOT tested: the live server or OpenAI.
- **Frontend**: optional. The website has its own text "I couldn't reach the assistant just now" (`src/sadhna-assistant/adapters/RealSadhnaGptAdapter.js`, line 155) for when the server does not answer at all (timeout/network). Not changed, as it also covers a student being offline.

## 🤖 [Chatbot] - 2026-10-07, 05:10 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The chatbot's fast first step now knows the nicknames of every activity in the real master list (16 activities, not 15), not only the 8 basic kinds. Study (study, adhyayan, अध्ययन), Menial Service (seva, service, cleaning, सेवा), Shloka Memorisation (shloka, verse, yaad kiya, कंठस्थ, श्लोक), Book Distribution (sankirtan, bd, vitran, वितरण), Prabhupada Book Reading (sp book, prabhupada ki book), Prabhupada Lecture Hearing (sp lecture, prabhupada pravachan), Spiritual Master Hearing (guru maharaj, gurudev, sb class...), Misc Book Reading (misc books, other books). Several of these can be in one message ("sp book 20 min aur sp lecture 30 min", "seva 40 min aur study 1 hour"). Book Distribution always goes to OpenAI when the unit is unclear (books or minutes?). The word lists are in `utils/assistantLexicon.js`.
- **Files touched**: `utils/assistantLexicon.js`, `utils/assistantParser.js`, `tests/assistantParser.test.mjs`, `CHANGELOG.md`
- **Tested**: 341 automatic checks pass (18 new, using the 16-activity list). The 3,000-sentence test still shows 0 wrong answers (about 90% understood without OpenAI), adding a stray number still always goes to OpenAI. NOT tested: live server, database, OpenAI. The real "type" of Book Distribution (books count or minutes) is a guess; if it is saved as a number of books, only messages with a clear unit go to OpenAI.
- **Frontend**: no change needed.

## 🤖 [Chatbot] - 2026-10-07, 04:10 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Added the common nicknames for every sadhana activity to the chatbot's fast first step, in English, Hinglish and Hindi (Devanagari), kept in one easy word list: `utils/assistantLexicon.js`. About 280 words, for example: chanting (japa, jap, jaap, mala, maala, harinam, hari naam, mantra, round, rd, जप, माला, राउंड); hearing (suna, pravachan, katha, class, satsang, shravan, lecture, sb class, gita class, श्रवण, प्रवचन); reading (padha, padhai, pustak, granth, swadhyay, sb, bg, cc, bhagavatam, gita, पढ़ाई, स्वाध्याय); day rest (aaram, vishram, nap, power nap, siesta, "din ki neend", आराम); sleep (soya, so gaya, so gaye, neend, bed, bedtime, lights off, सोया, नींद); wake-up (utha, uth gya, jaga, uthna, wokeup, "aankh khuli", "neend khuli", उठा, जागा); mangal aarti (mangal / mangla / mangala + aarti, arti, arati, aratik, morning aarti, bare "aarti", मंगल आरती). Also more spellings of units (ghnta, ghantey, minat, minit, rd, maala), "bje / बजे", Hindi number words (सोलह माला, दो घंटे), and Hindi time idioms (साढ़े चार बजे, सवा पाँच बजे, पौने पाँच बजे). A word inside a longer nickname goes with the longer one ("gita class" is hearing, "neend khuli" is wake-up). Other aartis (sandhya, gaur, shayan, dhoop, bhog, guru, narsimha, tulasi...) are never taken for Mangal Aarti; those messages go to OpenAI. To teach the chatbot a new nickname later, add it to the list in that file and add one test line.
- **Files touched**: `utils/assistantLexicon.js` (new), `utils/assistantParser.js` (now reads the word list), `tests/assistantParser.test.mjs`, `CHANGELOG.md`
- **Tested**: 323 automatic checks pass (74 new): every nickname in the list is tested on its own in a sentence, no nickname belongs to two kinds of activity, other aartis are never read as Mangal Aarti, plus 60+ sentences with the new words (Hindi idioms, spelling variants). The earlier 3,000-sentence test still shows 0 wrong answers (about 90% understood without OpenAI); a message takes about 0.15 ms. NOT tested: the live server, the database or the OpenAI step.
- **Frontend**: no change needed.

## 🤖 [Chatbot] - 2026-10-07, 03:30 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The chatbot's fast first step (the one that runs before OpenAI) is rewritten as a new reader in `utils/assistantParser.js`. Before, it matched the activity's exact name, so with real names like "Hearing(MIN)", "Reading(MIN)", "Day Rest(MIN)" or "Mangal Aarti Attended" almost nothing matched and about 70% of messages went to OpenAI. Now it finds the activity by meaning (hearing / pravachan / suna / lecture, reading / padha / book, day rest / aaram / "din me soya", mangal aarti, wake-up / utha, sleep / soya, chanting / japa / mala / round) and treats names with extra words ("Hearing Srila Prabhupada" vs "Hearing(MIN)") correctly. It splits the message into parts so each number goes to its own activity (no more 30 min hearing landing in reading, or one time given to two activities). Hours and fractions become minutes (1 ghanta = 60, dedh ghanta = 90, aadha ghanta = 30); "saade char baje" = 4:30; "did not attend", "nhi kiya", "mis ho gayi" are read as No; "chanting nahi hui" is saved as 0; rounds must be 0-64 and durations up to 12 hours; "14 mala" and "japa 14" work without the word chanting; a wake/sleep/completion time is only used by its own activity. Rule of the new reader: if ANY part of the message is unclear (an unused number, a correction word such as "actually", "sorry", "instead", a question, a range, a negative number, two activities that could match), the whole message goes to OpenAI instead of being saved half-understood. The old matching code is removed from `AssistantController.js`.
- **Files touched**: `utils/assistantParser.js` (new), `SadhanaGPT/Student/Controllers/AssistantController.js`, `tests/assistantParser.test.mjs` (new), `tests/helpers/sentenceGenerator.mjs` (new, made-up test messages only, no real data), `CHANGELOG.md`
- **Tested**: 249 automatic checks pass (`node --test "tests/*.test.mjs"`, no package needed), including 3,000 made-up messages in English, Hinglish and Hindi: about 90% are understood without OpenAI and 0 are accepted with a wrong answer; adding a stray number to a message always sends it to OpenAI; 5,000 random word mixes and 100,000-character inputs do not break it; a normal message takes about 0.08 ms. The controller passes a syntax check. NOT tested: the live server, the database, or the OpenAI step (no database or key here). The percentages come from test messages written by me, so real users may differ.
- **Frontend**: no change needed (same request and answer shape).

## 🤖 [Chatbot] - 2026-10-07, 02:20 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The chatbot now reads "which day is this about?" with a new, separate date reader (`utils/assistantDate.js`). Fixed: "1/2 ghanta" and "2-3 hours" or "5-6 rounds" were wrongly read as dates (1 Feb, 2 Mar, 5 Jun); "3 din pehle" and "N days ago" now use the real number (before, every "din pehle" meant 2 days) and that number is no longer mistaken for a chanting count; dates like 22/09, 05/10, 2026-09-22, "22 september", "5th oct", "oct 5th" now work; a year in the sentence is respected; dates just after New Year ("28 dec" said in January) go to last year; weekdays (monday, somvar, pichle somvar) work; Hindi (Devanagari) आज / कल / परसों / ३ दिन पहले work. If a message names two different days ("kal ... aaj ..."), it is now passed to the AI to decide instead of picking one. A date sent back by the AI is checked (real date, not in the future, not older than a year) before use. The old date code in `AssistantController.js` is removed.
- **Files touched**: `utils/assistantDate.js` (new), `SadhanaGPT/Student/Controllers/AssistantController.js`, `tests/assistantDate.test.mjs` (new), `CHANGELOG.md`
- **Tested**: 107 new automatic checks (run with `node --test "tests/*.test.mjs"`, no package needed), all pass; 1,656 generated test sentences (English, Hinglish, Hindi): wrong dates went from 328 to 0; the controller file passes a syntax check. Not run against the live server or the OpenAI step (no database or key here).
- **Frontend**: no change needed (same request and answer shape).

## ✨ [Feature] - 2026-10-07, 11:08 AM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Negative (penalty) marks, such as -5, are now supported in custom marking schemes, like in the counsellor's scheme builder. Two small safety fixes for it: the day's percentage never shows below 0%, and a scheme whose rules are all negative still marks one rule as its maximum. No database change (the marks columns already hold negatives).
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Tested**: 7 new local checks (save, store, read back, score, percentage, ranking) plus the earlier 31 + 6 + 7 checks, on a copy of the data (SQLite, not MySQL).
- **Frontend**: the custom scheme editor lets the user type or toggle a minus sign (see the frontend entry).

## 🐛 [Fix] - 2026-10-07, 09:15 AM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The "most marks possible" part of the daily score no longer uses a nested `SELECT DISTINCT ... ) f` table; it reads `fix_activities` directly and groups by activity. Same result (checked on a copy of real data: 85 students x 4 schemes, 340 comparisons, 0 differences). Made because the server reported `Unknown column 'f.master_activity_id' in 'WHERE'` for this query; the cause is not confirmed (the old query was unchanged by the My Marking Scheme work and no code uses the removed `users.personal_marking_scheme_id` column). No database change.
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: 31 + 6 local checks pass; old and new query give identical totals on MariaDB 10.11 with real data. Not tried on your MariaDB 11 server.
- **Frontend**: nothing needed.

## ✨ [Feature] - 2026-10-06, 08:41 PM IST

- **Developer**: Manvatar Prabhu Ji
- **What changed**: `/my-marking-scheme` now also sends the counsellor scheme that applies to the student (sub-group first, else group): its rules, its level, and the name and email of the counsellor who made it. Sent only when such a scheme applies; nothing is sent about any other scheme or person. No database change.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/PersonalSchemeController.js`, `CHANGELOG.md`
- **Tested**: 7 local checks on a copy of the data (group scheme, sub-group wins, none -> empty, only name and email sent, no login refused). Ran on SQLite, not MySQL.
- **Frontend**: the Marks window shows a read-only "Counsellor Scheme" tab from the new `counsellor_scheme` field.

## 2026-10-06, 8:05 PM IST - Feature (marks of the day activity by activity, for the "Today's Sadhana Score" window)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: New route `POST /daily-marks-breakdown` with `{ "activity_date": "YYYY-MM-DD" }` (the person always comes from the login token; today if no date). It answers, for each of the person's activities that carry marks: the name, the value entered, the marks earned and the most that activity can give under the scheme that applies to the person (their own scheme's rule for the activity, else the default scheme's), plus the day's totals, the scheme id and where it comes from (`subgroup`, `group`, `personal`, `default`). The totals are worked out the same way as `/daily-score`.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/MarksBreakdownController.js` (new), `routes/Routes.js`, `CHANGELOG.md`
- **Tested**: Replayed a student from the 11:33 UTC test-database export with a copy of the real code (6 checks, all passing, file `t009.mjs` in the scratchpad): 8 activities listed; the totals equal the day score (80/175); per-activity earned and maximum are right (Chanting 30 / 30 under the group scheme); with an own scheme switched on the chanting maximum follows it (100) and the totals still equal the day score; no login is refused. Syntax check. The repo has no automatic tests or linter. Not run on the real server.
- **Database**: none.
- **Frontend**: used by the new score window (arrow beside "Today's Sadhana Score") in `sadhanagptreactweb`, same day.

## 2026-10-06, 7:40 PM IST - Feature (step 3 of "My Marking Scheme": rankings, follow-up list and export follow each person's scheme)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Percentages and ranks (group and global) use the daily maximum of the scheme that applies to each person, so a student on their own scheme is ranked by their own percentage, as agreed (option D). One change in the shared ranking helper covers the student rank, weekly ranking and follow-up list; the counsellor's bulk export uses the same scheme rule for the maximum per activity. The counsellor's rank list (`/student-rank`) and follow-up list (`/student-followup`) now carry `uses_own_scheme` (true only when the person is really scored with their own scheme, not when a counsellor scheme overrides it) for the "Own scheme" tag.
- **Files touched**: `SadhanaGPT/Controllers/SummaryData/rankingPercent.js`, `showRank.js`, `followUpStudents.js`, `SadhanaGPT/Mentors/CounslerController.js`, `CHANGELOG.md`
- **Tested**: Replayed a student from the 11:33 UTC test-database export with a copy of the real code (31 checks, all passing, file `t008.mjs` in the scratchpad): own scheme created off, switched on and off; counsellor scheme overriding it and the own scheme applying again when the counsellor scheme is removed; saving an entry, the day score, the ranking maximum and the SQL scheme expression all agree; today recalculated while an earlier day keeps its marks; reserved name refused; own scheme hidden from scheme lists; read-only view allowed for the student's own counsellor and refused for another; the tag appears only for counsellors. Syntax check on every changed file. The repo has no automatic tests or linter. Not run on the real server.
- **Database**: none.
- **Frontend**: on the counsellor's rankings screen show an "Own scheme" tag when `uses_own_scheme` is true and open the read-only view (`/student-own-scheme`) from it. Students' screens do not receive the tag.

## 2026-10-06, 7:35 PM IST - Feature (step 2 of "My Marking Scheme": save, switch on/off, counsellor read-only view)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: New routes so a person can manage their own scheme, all taking the owner from the login token (never from the request): `POST /my-marking-scheme` (my scheme, whether I use it, what applies to me now, my rules), `POST /my-scheme-activities` (activities I can write rules for), `POST /my-marking-rules` (rules of the default scheme or mine), `POST /my-save-scheme` (saves my rules; the scheme is created on the first save, switched OFF unless `use_for_self` is true; id, name and owner always come from the server), `POST /my-delete-rule`, `POST /my-delete-activity-rules`, `POST /use-my-marking-scheme` with `{ "use": true | false }` (own or default; today's entries are recalculated in the background, earlier days keep their marks). Counsellors: `POST /student-own-scheme` with `{ "student_id" }`, a read-only view of a student's own scheme, allowed only for that student's own counsellor. The name "... My Marking Scheme" is reserved: normal scheme create/rename is refused with it, and own schemes are hidden from scheme lists. The recalculation can now also be started for named people.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/PersonalSchemeController.js` (new), `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js`, `routes/Routes.js`, `CHANGELOG.md`
- **Tested**: Replayed a student from the 11:33 UTC test-database export with a copy of the real code (31 checks, all passing, file `t008.mjs` in the scratchpad): own scheme created off, switched on and off; counsellor scheme overriding it and the own scheme applying again when the counsellor scheme is removed; saving an entry, the day score, the ranking maximum and the SQL scheme expression all agree; today recalculated while an earlier day keeps its marks; reserved name refused; own scheme hidden from scheme lists; read-only view allowed for the student's own counsellor and refused for another; the tag appears only for counsellors. Syntax check on every changed file. The repo has no automatic tests or linter. Not run on the real server.
- **Database**: none.
- **Frontend**: needs a "My Marking Scheme" window for students and counsellors (switch default / own, edit rules) using the routes above, and a read-only "student's own scheme" window for counsellors opened from the rankings screen. To be described in the next step.

## 2026-10-06, 7:30 PM IST - Feature (step 1 of "My Marking Scheme": the person's own scheme is used when marks are saved and scored)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: A student or counsellor can now have their own scheme, stored as an ordinary row of `marking_schemes` named "<user_id> My Marking Scheme" (owner = the person, `is_enabled` = 1 means "I use it", 0 means "I use the default"). Which scheme applies is now: counsellor's sub-group scheme, else counsellor's group scheme, else the person's own scheme (if switched on), else the default. A counsellor's scheme always overrides the own scheme without deleting it. The new rule lives in one shared file (`effectiveScheme.js`) and is used when an entry is saved (marks), when the day's score is worked out, on the "applied marking scheme" screen (new level "My Own Scheme"), in the student's export (maximum marks per activity) and by the assistant/WhatsApp entry. The counsellor-only weekly-ranking list also gets a `uses_own_scheme` tag.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/effectiveScheme.js` (new), `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: Replayed a student from the 11:33 UTC test-database export with a copy of the real code (31 checks, all passing, file `t008.mjs` in the scratchpad): own scheme created off, switched on and off; counsellor scheme overriding it and the own scheme applying again when the counsellor scheme is removed; saving an entry, the day score, the ranking maximum and the SQL scheme expression all agree; today recalculated while an earlier day keeps its marks; reserved name refused; own scheme hidden from scheme lists; read-only view allowed for the student's own counsellor and refused for another; the tag appears only for counsellors. Syntax check on every changed file. The repo has no automatic tests or linter. Not run on the real server.
- **Database**: none. No column, table or setting is added; the unused `users.personal_marking_scheme_id` column on the test database is not read.
- **Frontend**: nothing changes yet; "applied marking scheme" can now return `applied_level: "My Own Scheme"`, and the weekly ranking list for counsellors carries `uses_own_scheme`.

## 2026-10-06, 6:07 PM IST - Revert (score retry / error answer, again)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Undone on request, because the cause of the wrong Marks circle and jumping sliders was found on the server side: the day's score retry and the "error instead of a false 0%" answer (`10c2c80`, same change as `7577735`). The score code is back to the main version. A new "revert" commit was made (history is kept, nothing rewritten).
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: file compared with the main code zip (identical); syntax check run.
- **Database**: none.
- **Frontend**: reverted the same way in `sadhanagptreactweb` (newest-answer-wins and circle retry / re-check).

## 2026-10-06, 4:52 PM IST - Fix (applied again: the day's score no longer shows a false 0% when something goes wrong)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Applied again on request (it was undone earlier today to match the main code zip, commit `7577735`): when the server cannot work out the day's score (for example a short database hiccup), it retries once, and if it still fails it answers an error instead of "0 of 0 marks" and logs the real reason (`Daily score failed, retrying once: ...`). The score answer also tells browsers and proxies never to keep an old copy. The assistant chat still gets zeros on failure and never crashes. A new commit was made (history is kept, nothing rewritten).
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: file is identical to the earlier tested commit `7577735` (7 checks passed then); syntax check run now. Not run on the real server.
- **Database**: none.
- **Frontend**: works together with the circle retry / newest-answer-wins commits in `sadhanagptreactweb`, applied again the same day.

## 2026-10-06, 3:44 PM IST - Revert (score retry / error answer)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Undone on request, to bring the test branch back in line with the main code zip: the day's score retry and the "error instead of a false 0%" answer (`7577735`). The score code is back to the main version (a hiccup gives "0 of 0 marks" again). A new "revert" commit was made (history is kept, nothing rewritten).
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: file compared with the main code zip (identical); syntax check run.
- **Database**: none.
- **Frontend**: reverted the same way in `sadhanagptreactweb` (circle retry / newest-answer-wins fixes and the leftover test alert).

## 2026-10-05, 8:43 PM IST - Fix (the day's score no longer shows a false 0% when something goes wrong)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Applied again (it was undone with the 1:10 PM revert) on top of the current code: when the server could not work out the day's score (for example a short database hiccup) it answered "0 of 0 marks" as if that were the score, so the marks circle showed 0% until the page was reloaded. Now a hiccup is retried once, and if it still fails the server answers an error instead of fake zeros and logs the real reason (`Daily score failed, retrying once: ...`). The score answer also tells browsers and proxies never to keep an old copy. The assistant chat, which only needs a number to show, still gets zeros on failure and never crashes. Only this fix is applied again, not the own-scheme feature or the after-deploy scripts.
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: replayed a student from the 6:08 PM database export with a copy of the real code (7 checks, all passing): normal score 80/175; one simulated database error is retried and still gives 80/175; a lasting error gives an error answer (not 0%) while the assistant helper still returns zeros; the success answer carries "Cache-Control: no-store". Not run on the real server.
- **Database**: none.
- **Frontend**: the screen should ignore older replies and keep the last good score (done in `sadhanagptreactweb`, same day).

## 2026-10-05, 7:30 PM IST - Revert (everything made after 1:10 PM IST today)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Undone on request: all 11 commits made after 1:10 PM IST on 2026-10-05, with new "revert" commits (history is kept, nothing rewritten). That removes: the own (personal) marking scheme feature for students and counsellors (`e75c8aa`), the one-time DB-002 apply script and the after-deploy database-change system with its result email (`8cc1bff`, `8bd48c2`, `ca40e28`, `8e3cbcd`, `c0b044a`, `8796b21`), the DB-003 self-test (`d6fcbab`, `92f028e`), the score retry / error answer (`5f06b00`) and the re-scoring race guard (`935e44d`). The code is back exactly as it was at 1:02 PM IST (`5b653ea`); checked by comparing the files.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/` (`MarkingController.js`, `recalculateMarks.js`, `PersonalSchemeController.js` and `effectiveScheme.js` removed), `SadhanaGPT/Controllers/SummaryData/rankingPercent.js`, `SadhanaGPT/Mentors/CounslerController.js`, `SadhanaGPT/Student/Controllers/StudentController.js`, `routes/Routes.js`, `scripts/after-deploy-test.sh` and `scripts/db-changes/*` (removed), `DBnew.md` (note on DB-002), `CHANGELOG.md`
- **Tested**: file-by-file comparison with the 1:02 PM state (identical apart from the DBnew.md note and this entry); syntax check of the changed backend files. Not run on a server.
- **Database**: nothing run by Claude. DB-002 had already been applied on the TEST database (about 3:31 PM IST): the extra column `users.personal_marking_scheme_id`, its index and foreign key stay there, unused and harmless (two accounts hold a value that the code now ignores). Nothing needs to be dropped.
- **Frontend**: reverted the same way in `sadhanagptreactweb` (own-scheme screens, marks circle and slider fixes, editor warning).

## 2026-10-05, 1:25 PM IST - Plan (database log only)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Wrote the proposed database change for the "my own marking scheme" feature into the database log as DB-002 (one new empty column `users.personal_marking_scheme_id`). Nothing was run and no code changed; the feature code waits until the developer has run the query on the test database.
- **Files touched**: `DBnew.md`, `CHANGELOG.md`
- **Tested**: not applicable (text only).
- **Frontend**: nothing yet; a student "My marking scheme" screen and a "Use for me" switch for counsellors will follow.

## 2026-10-05, 1:05 PM IST - Change (rankings by percentage)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: All ranking screens now rank by PERCENTAGE instead of raw marks. Percentage = marks earned / (the student's own daily maximum x days in the period). The daily maximum comes from the student's own marking scheme (sub-group scheme, else group scheme, else default) and counts each activity the student has once. The days stay as they were: Daily = today, Previous day = yesterday, Weekly = last 7 days including today (student ranking); last Monday to Sunday (counsellor weekly rank and follow-up list). Order: percentage, then total marks, then name; same percentage and same marks share a rank. Students with no entries are kept at the bottom (all active students are now listed, not only those with entries). "Top ranker" is only given to a first place with marks above 0. The student's daily score percentage (`getDailyScore`) now also counts a doubled activity once, so it matches the ranking percentage. New fields in the `/weekly-ranking` list: `rank`, `percentage`, `max_marks`. The old counsellor percentage used the highest value in `summary_report.max_possible_marks`, which is inflated (it adds rules of several schemes); it is no longer used for ranking. No database change.
- **Files touched**: `SadhanaGPT/Controllers/SummaryData/rankingPercent.js` (new), `SadhanaGPT/Student/Controllers/StudentController.js`, `SadhanaGPT/Controllers/SummaryData/showRank.js`, `SadhanaGPT/Controllers/SummaryData/followUpStudents.js`, `CHANGELOG.md`
- **Tested**: with the mock database copy (SQLite stand-in, not a real MariaDB): daily maximums match the old calculation for 55 of 63 students; the other 8 are lower only because they hold the same activity twice (now counted once). Ranking, ties, zero-entry students at the bottom, page 2+, own rank, yesterday/weekly/group filters and the counsellor lists all ran and gave sensible output. Not tested on the live database or in the apps.
- **Frontend**: `NotificationsPanel.jsx` and `Inspiration.jsx` show `#idx+1` as the rank and only marks; they should show `user.rank` (ties) and `user.percentage`. Counsellor screens already receive `percentage` and `rank`.

## 2026-10-05, 11:38 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Saving, creating, changing or deleting a marking scheme could answer "failed" although the scheme was already stored. After the scheme is written, the server recalculates today's marks for the students on it and used to WAIT for that (up to 8 seconds) before answering; finding the affected groups was also outside any safety net. A slow or failing recalculation therefore turned a successful save into a "failed" message (this step arrived with the earlier marks changes). The recalculation now runs in the background (`recalculateTodayMarksInBackground`): the answer is sent as soon as the scheme is saved, and any problem in the recalculation is only logged. Marks of today's entries are updated a few seconds after saving. No database change.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js`, `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Tested**: helper returns at once, recalculation still finishes in the background (marks 20 / 15 / 25 as before), a failing lookup is swallowed and logged. I could not see the server log, so the exact error that showed on the test site is not confirmed; if "failed" still appears, the toast text after "Failed to save scheme:" (or the server log line "Error saving marking scheme") shows the real reason.
- **Frontend**: no change needed.

## 2026-10-05, 11:29 AM IST - Fix (marks, part 3 of 3)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Marks are now worked out with the SAME scheme that the "Applied Marking Scheme" screen shows the student. That screen treats a sub-group that only carries the DEFAULT scheme as "use my group's scheme", but saving marks (in the app and by WhatsApp) let that default hide the group's custom scheme, so a student of such a sub-group saw the new scheme but earned the default scheme's marks. One shared rule (`resolveEffectiveSchemeId`) now decides: the sub-group's own custom scheme, else the group's scheme, else the default. It is used when saving marks, when recalculating today's marks after a scheme is allotted, and in the counsellor and student reports' "max possible" columns. No database change.
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js`, `SadhanaGPT/Mentors/CounslerController.js`, `CHANGELOG.md`
- **Tested (parts 2 and 3 together)**: ran the real recalculation code against a stand-in database with three students, each with Chanting 16 rounds saved as 25 today: a student in a default sub-group under a group on a 20-marks scheme now gets 20, a student with their own sub-group scheme gets that scheme's 15, a student on the default scheme stays 25. The resolver gives the sub-group's custom scheme, else the group's, else default. Not run against a live server.
- **Frontend**: no change needed. Marks saved before the fixes change only when the entry is saved again or a scheme is allotted / saved again (today's entries are then recalculated).

## 2026-10-05, 11:28 AM IST - Fix (marks, part 2 of 3)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: When a marking scheme is allotted to a group or sub-group, saved, changed or removed, the marks already saved TODAY (IST) for the students on that scheme are recalculated with the scheme that now applies to each student, and their daily summary is refreshed. Earlier days are never touched. Marks are worked out when an entry is saved, so before this the new scheme only counted for entries saved afterwards. It never stops the scheme from saving (any failure is only logged), and for a very large group it waits at most 8 seconds and carries on in the background. The built-in default scheme is never recalculated this way. This restores the earlier recalculation change (new file `recalculateMarks.js` plus calls in the scheme save / create / update / delete code). No database change.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/recalculateMarks.js` (new), `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Tested**: syntax only so far; the final state (with part 3) is tested together before pushing.
- **Frontend**: no change needed.

## 2026-10-05, 11:28 AM IST - Fix (marks, part 1 of 3)

- **Developer**: Manvatar Prabhu Ji
- **What changed**: Marks now follow the student's custom scheme. The marks code fetched the rules of the student's scheme AND the default scheme together and awarded the HIGHEST matching mark, so a default rule worth more always won: with scheme "new3" saying 16+ rounds = 20 marks and the default saying 16+ = 25, Chanting still earned 25. Now only the student's own scheme rules are used for an activity; the default scheme's rules are used only for an activity the scheme has no rule for. Applies to saving an entry in the app/assistant and to WhatsApp logging. No database change. (This restores the part of the earlier reverted fix that is still needed. The corrupted-rule cause is fixed separately.)
- **Files touched**: `SadhanaGPT/Student/Controllers/StudentController.js`, `CHANGELOG.md`
- **Tested**: ran the real marks functions on the default Chanting rules from the mirror database against a scheme with 16+ = 20: 16 rounds gave 25 with the old code and 20 with the new; a scheme with no Chanting rules still falls back to the default (25). Not run against a live server.
- **Important**: marks are worked out when an entry is SAVED, so entries already saved today still show 25 until they are saved again or recalculated (part 2 of 3 does the recalculation when a scheme is allotted).
- **Frontend**: no change needed.

## 2026-10-05, 11:17 AM IST - Log file

- **Developer**: Manvatar Prabhu Ji
- **What changed**: New log file `DBnew.md` for every database change (query, reason, risk, undo, status, and a place for the developer to record when and where it was run). It lists DB-001 (label the 5 default Chanting rules as 'system', PENDING, to be run by the developer) and the earlier migration files as "not required now". Claude does not run database changes.
- **Files touched**: `DBnew.md` (new), `CHANGELOG.md`
- **Database query**: none run. DB-001 is written in `DBnew.md` for the developer to run.
- **Frontend**: no change needed.

## 2026-10-05, 11:15 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: A new marking scheme now copies ALL rules of the default scheme. It used to copy only rules whose owner label was 'system', and the 5 default Chanting rules (ids 1846 to 1851) have no owner label, so Chanting was never copied: scheme "New scheme" (id 9) has no Chanting rules and "New2" (id 17) had one hand-added (corrupted) row. The copy now finds the rules through the default scheme itself (the scheme owned by 'system'), so the owner label of each rule no longer matters. Existing schemes are not changed by this (the counsellor fills Chanting in the editor).
- **Database query (data only, NOT run by Claude, to be run by the developer, optional safety net)**: gives the 5 default Chanting rules the same owner label as the other 67 default rules, so they also match anything that looks for 'system' rules. Only the clone query used the label, so nothing else changes.
  `UPDATE marking_rules SET counsellor_id = 'system' WHERE scheme_id = 1 AND master_activity_id = 1 AND counsellor_id IS NULL;`
  Expected: 5 rows changed. Check before: `SELECT id, counsellor_id FROM marking_rules WHERE scheme_id = 1 AND master_activity_id = 1;` (5 rows, counsellor_id NULL). Undo: `UPDATE marking_rules SET counsellor_id = NULL WHERE id IN (1846,1847,1848,1849,1851);`
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Tested**: on the mirror database's rules the old query copies 67 rules (0 Chanting) and the new one copies 72 (5 Chanting) with the same per-activity counts as the default scheme. Not run against a live server.
- **Frontend**: no change needed.

## 2026-10-05, 11:08 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: The marking-scheme editor can no longer save a corrupted rule. Root cause of the "chanting earns 25 although the new scheme says 20" problem: when a counsellor adds an activity to a scheme, the screen sends the activity's UNIT ("rounds") where the server expects the frequency, and starts the row with an empty target number. The server stored the unit as an empty frequency and the empty number as the operator text (">= "). The marks code ignores a rule without a valid frequency, so the scheme fell back to the default scheme's 25. Now: (1) only daily / weekly / monthly are accepted as the frequency, and for anything else the frequency the default scheme gives that activity is used (else daily); (2) before anything is saved, every row is checked and a row with no target value is refused with a message such as "Please enter the target value for Chanting (the 20 marks row) before saving." (the screen already shows the server's message); (3) when an already saved rule is saved again, an invalid frequency is repaired (valid ones are left alone). The row/value cleaning code moved to a new small file `ruleInput.js` with identical behaviour. No database change.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/ruleInput.js` (new), `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Tested**: replayed all 207 rules of the mirror database through the new checks: only the one corrupted rule (id 2191, scheme "New2", Chanting) is refused, the others pass unchanged (the existing true/false to Yes/No conversion is the same as before). The frequency repair statement was checked on a stand-in database. Not run against a live server or MariaDB.
- **Still to do (not a code change)**: the already-corrupted rule 2191 is repaired by opening the "New2" scheme, entering the Chanting target number (and the other bands if wanted) and saving; or by the one-row repair SQL in migration 002 (step 3).
- **Frontend**: no change needed.

## 2026-10-05, 10:58 AM IST - Fix

- **Developer**: Manvatar Prabhu Ji
- **What changed**: "Reading Srila Prabhupada Book" (activity 8) was also missing from the marking-scheme editor, for the same reason as the Custom Activities list: its owner field holds an empty text and the editor's list only accepted "nothing", the word "null", or the counsellor's own id. The editor's list now also accepts the empty text, so counsellors can see and edit that activity's marking rules (rules for it already exist in the default scheme and the custom schemes). Other counsellors' custom activities stay hidden. No database change.
- **Files touched**: `SadhanaGPT/Controllers/Marking Rules/MarkingController.js`, `CHANGELOG.md`
- **Tested**: on the mirror database's activity list the old condition hides activity 8 and the new one shows it (15 rows instead of 14); another counsellor's custom activity is still hidden. Not run against a live server.
- **Frontend**: no change needed.

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
