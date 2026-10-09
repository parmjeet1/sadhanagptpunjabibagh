-- =====================================================================
-- READING + LECTURES: PLACEHOLDER DEFAULT DATA   (STATUS: PENDING - NOT RUN)
-- Developer: Manvatar Prabhu Ji          Written: 2026-10-09
-- Run AFTER DB-PROPOSAL.sql, on the TEST database first, by hand.
--
-- THIS IS ONLY A PLACEHOLDER so the screens have something to show while the
-- real default list is being prepared. The levels and the order below are a
-- starting guess (not an official ISKCON order): the four Bhakti-sastri books
-- are the ones listed by the Mayapur Institute course page; the rest are
-- common Prabhupada books. Replace / edit them when your list arrives
-- (the real list can be loaded with the same kind of INSERTs, or edited in
-- the counsellor screen).
-- Hindi titles are filled only where the Hindi name is certain; the rest stay NULL.
-- Lectures: NO lectures are invented here (no titles or links without your list).
-- =====================================================================

INSERT INTO `reading_books` (`title`, `title_hi`, `author`) VALUES
 ('Bhagavad-gita As It Is',   'भगवद्गीता यथारूप', 'Srila Prabhupada'),
 ('Sri Isopanisad',           'श्री ईशोपनिषद',     'Srila Prabhupada'),
 ('Nectar of Instruction',    'उपदेशामृत',          'Srila Prabhupada'),
 ('Nectar of Devotion',       NULL,                'Srila Prabhupada'),
 ('Srimad-Bhagavatam',        'श्रीमद्भागवतम्',      'Srila Prabhupada'),
 ('Sri Caitanya-caritamrta',  'श्री चैतन्य चरितामृत', 'Srila Prabhupada'),
 ('Krsna, the Supreme Personality of Godhead', NULL, 'Srila Prabhupada');

-- Levels of the system default reading plan (plan id looked up, not guessed)
SET @plan := (SELECT id FROM learning_plans WHERE kind='reading' AND scope='default' AND owner_id IS NULL LIMIT 1);

INSERT INTO `reading_plan_levels` (`plan_id`, `name`, `name_hi`, `sort_order`) VALUES
 (@plan, 'Level 1 - Foundation',        'स्तर 1 - आधार',      1),
 (@plan, 'Level 2 - Bhakti-sastri',     'स्तर 2 - भक्ति-शास्त्री', 2),
 (@plan, 'Level 3 - Deeper study',      'स्तर 3 - गहन अध्ययन',  3);

SET @l1 := (SELECT id FROM reading_plan_levels WHERE plan_id=@plan AND sort_order=1);
SET @l2 := (SELECT id FROM reading_plan_levels WHERE plan_id=@plan AND sort_order=2);
SET @l3 := (SELECT id FROM reading_plan_levels WHERE plan_id=@plan AND sort_order=3);

INSERT INTO `reading_plan_books` (`plan_id`, `level_id`, `book_id`, `sort_order`)
SELECT @plan, @l1, id, 1 FROM reading_books WHERE title='Bhagavad-gita As It Is' AND created_by IS NULL
UNION ALL SELECT @plan, @l2, id, 1 FROM reading_books WHERE title='Sri Isopanisad'        AND created_by IS NULL
UNION ALL SELECT @plan, @l2, id, 2 FROM reading_books WHERE title='Nectar of Instruction'  AND created_by IS NULL
UNION ALL SELECT @plan, @l2, id, 3 FROM reading_books WHERE title='Nectar of Devotion'     AND created_by IS NULL
UNION ALL SELECT @plan, @l3, id, 1 FROM reading_books WHERE title='Srimad-Bhagavatam'      AND created_by IS NULL
UNION ALL SELECT @plan, @l3, id, 2 FROM reading_books WHERE title='Sri Caitanya-caritamrta' AND created_by IS NULL
UNION ALL SELECT @plan, @l3, id, 3 FROM reading_books WHERE title LIKE 'Krsna, the Supreme%' AND created_by IS NULL;

-- UNDO (removes only this placeholder data; the tables stay):
-- DELETE FROM reading_plan_books  WHERE plan_id = (SELECT id FROM learning_plans WHERE kind='reading' AND scope='default');
-- DELETE FROM reading_plan_levels WHERE plan_id = (SELECT id FROM learning_plans WHERE kind='reading' AND scope='default');
-- DELETE FROM reading_books WHERE created_by IS NULL AND title IN ('Bhagavad-gita As It Is','Sri Isopanisad','Nectar of Instruction','Nectar of Devotion','Srimad-Bhagavatam','Sri Caitanya-caritamrta') OR title LIKE 'Krsna, the Supreme%';
