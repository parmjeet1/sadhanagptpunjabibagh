-- =====================================================================
-- READING + LECTURES: DEFAULT BOOK LIST   (STATUS: PENDING - NOT RUN)
-- Developer: Manvatar Prabhu Ji          Written: 2026-10-09
-- Source: "Srila Prabhupada - Book Reading Plan" PDF supplied by the developer
--         (Level 1 = 22 books, Level 2 = 15 books, Level 3 = 17 books; 54 total).
-- Run AFTER DB-PROPOSAL.sql, on the TEST database first, by hand, in ONE session
-- (the @variables below do not carry over to another session).
-- Run it ONCE. Running twice would add every book twice.
-- If you already ran the OLD placeholder version of this file, first run the
-- CLEAN-UP block at the bottom, then run this file.
-- Hindi titles are left empty (NULL) on purpose; they can be added later.
-- No lectures are added here (list not supplied yet).
-- =====================================================================

INSERT INTO `reading_books` (`title`, `author`) VALUES
 ('Elevation to Krishna Consciousness', 'Srila Prabhupada'),
 ('On The Way to Krishna', 'Srila Prabhupada'),
 ('Krishna Consciousness the Matchless Gift', 'Srila Prabhupada'),
 ('Krishna the Reservoir of Pleasure', 'Srila Prabhupada'),
 ('Perfection of Yoga', 'Srila Prabhupada'),
 ('Krishna Consciousness - The Topmost Yoga System', 'Srila Prabhupada'),
 ('Beyond Birth and Death', 'Srila Prabhupada'),
 ('Perfect Questions, Perfect Answers', 'Srila Prabhupada'),
 ('Easy Journey to Other Planets', 'Srila Prabhupada'),
 ('Raja Vidya: The King of Knowledge', 'Srila Prabhupada'),
 ('Transcendental Teachings of Prahlad Maharaj', 'Srila Prabhupada'),
 ('Coming Back', 'Srila Prabhupada'),
 ('Message of Godhead', 'Srila Prabhupada'),
 ('Civilization and Transcendence', 'Srila Prabhupada'),
 ('Hare Krishna Challenge', 'Srila Prabhupada'),
 ('Scientific Basis of Krishna Consciousness', 'Srila Prabhupada'),
 ('Sword of Knowledge', 'Srila Prabhupada'),
 ('Nectar of Instruction', 'Srila Prabhupada'),
 ('Path of Perfection', 'Srila Prabhupada'),
 ('Prabhupada Condensed', 'Srila Prabhupada'),
 ('Prabhupada Lilamrita (Volume 1)', 'Srila Prabhupada'),
 ('Prabhupada Lilamrita (Volume 2)', 'Srila Prabhupada'),
 ('Introduction to Bhagavad Gita As It Is', 'Srila Prabhupada'),
 ('Science of Self Realization', 'Srila Prabhupada'),
 ('Journey of Self Discovery', 'Srila Prabhupada'),
 ('Life Comes from Life', 'Srila Prabhupada'),
 ('Nectar of Devotion (Only Part One)', 'Srila Prabhupada'),
 ('Teachings of Queen Kunti', 'Srila Prabhupada'),
 ('Teachings of Lord Kapila', 'Srila Prabhupada'),
 ('Teachings of Lord Chaitanya', 'Srila Prabhupada'),
 ('Sri Isopanishad', 'Srila Prabhupada'),
 ('Krishna Book', 'Srila Prabhupada'),
 ('A Second Chance', 'Srila Prabhupada'),
 ('Prabhupada Lilamrita (Volume 3)', 'Srila Prabhupada'),
 ('Prabhupada Lilamrita (Volume 4)', 'Srila Prabhupada'),
 ('Prabhupada Lilamrita (Volume 5)', 'Srila Prabhupada'),
 ('Prabhupada Lilamrita (Volume 6)', 'Srila Prabhupada'),
 ('Bhagavad Gita As It Is', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 1', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 2', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 3', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 4', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 5', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 6', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 7', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 8', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 9', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 10', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 11', 'Srila Prabhupada'),
 ('Srimad Bhagavatam Canto 12', 'Srila Prabhupada'),
 ('Chaitanya Charitamrita (Adi Lila)', 'Srila Prabhupada'),
 ('Chaitanya Charitamrita (Madhya Lila)', 'Srila Prabhupada'),
 ('Chaitanya Charitamrita (Antya Lila)', 'Srila Prabhupada'),
 ('Chaitanya Charitamrita (Complete)', 'Srila Prabhupada');

SET @plan := (SELECT id FROM learning_plans WHERE kind='reading' AND scope='default' AND owner_id IS NULL LIMIT 1);

INSERT INTO `reading_plan_levels` (`plan_id`, `name`, `sort_order`) VALUES
 (@plan, 'Level 1 - Category I',   1),
 (@plan, 'Level 2 - Category II',  2),
 (@plan, 'Level 3 - Category III', 3);

SET @l1 := (SELECT id FROM reading_plan_levels WHERE plan_id=@plan AND sort_order=1);
SET @l2 := (SELECT id FROM reading_plan_levels WHERE plan_id=@plan AND sort_order=2);
SET @l3 := (SELECT id FROM reading_plan_levels WHERE plan_id=@plan AND sort_order=3);

-- Each line: level, position inside the level (the order in your PDF), title.
INSERT INTO `reading_plan_books` (`plan_id`, `level_id`, `book_id`, `sort_order`)
SELECT @plan, CASE x.lvl WHEN 1 THEN @l1 WHEN 2 THEN @l2 ELSE @l3 END, b.id, x.pos
FROM (
 SELECT 1 AS lvl, 1 AS pos, 'Elevation to Krishna Consciousness' AS title
 UNION ALL SELECT 1 AS lvl, 2 AS pos, 'On The Way to Krishna' AS title
 UNION ALL SELECT 1 AS lvl, 3 AS pos, 'Krishna Consciousness the Matchless Gift' AS title
 UNION ALL SELECT 1 AS lvl, 4 AS pos, 'Krishna the Reservoir of Pleasure' AS title
 UNION ALL SELECT 1 AS lvl, 5 AS pos, 'Perfection of Yoga' AS title
 UNION ALL SELECT 1 AS lvl, 6 AS pos, 'Krishna Consciousness - The Topmost Yoga System' AS title
 UNION ALL SELECT 1 AS lvl, 7 AS pos, 'Beyond Birth and Death' AS title
 UNION ALL SELECT 1 AS lvl, 8 AS pos, 'Perfect Questions, Perfect Answers' AS title
 UNION ALL SELECT 1 AS lvl, 9 AS pos, 'Easy Journey to Other Planets' AS title
 UNION ALL SELECT 1 AS lvl, 10 AS pos, 'Raja Vidya: The King of Knowledge' AS title
 UNION ALL SELECT 1 AS lvl, 11 AS pos, 'Transcendental Teachings of Prahlad Maharaj' AS title
 UNION ALL SELECT 1 AS lvl, 12 AS pos, 'Coming Back' AS title
 UNION ALL SELECT 1 AS lvl, 13 AS pos, 'Message of Godhead' AS title
 UNION ALL SELECT 1 AS lvl, 14 AS pos, 'Civilization and Transcendence' AS title
 UNION ALL SELECT 1 AS lvl, 15 AS pos, 'Hare Krishna Challenge' AS title
 UNION ALL SELECT 1 AS lvl, 16 AS pos, 'Scientific Basis of Krishna Consciousness' AS title
 UNION ALL SELECT 1 AS lvl, 17 AS pos, 'Sword of Knowledge' AS title
 UNION ALL SELECT 1 AS lvl, 18 AS pos, 'Nectar of Instruction' AS title
 UNION ALL SELECT 1 AS lvl, 19 AS pos, 'Path of Perfection' AS title
 UNION ALL SELECT 1 AS lvl, 20 AS pos, 'Prabhupada Condensed' AS title
 UNION ALL SELECT 1 AS lvl, 21 AS pos, 'Prabhupada Lilamrita (Volume 1)' AS title
 UNION ALL SELECT 1 AS lvl, 22 AS pos, 'Prabhupada Lilamrita (Volume 2)' AS title
 UNION ALL SELECT 2 AS lvl, 1 AS pos, 'Introduction to Bhagavad Gita As It Is' AS title
 UNION ALL SELECT 2 AS lvl, 2 AS pos, 'Science of Self Realization' AS title
 UNION ALL SELECT 2 AS lvl, 3 AS pos, 'Journey of Self Discovery' AS title
 UNION ALL SELECT 2 AS lvl, 4 AS pos, 'Life Comes from Life' AS title
 UNION ALL SELECT 2 AS lvl, 5 AS pos, 'Nectar of Devotion (Only Part One)' AS title
 UNION ALL SELECT 2 AS lvl, 6 AS pos, 'Teachings of Queen Kunti' AS title
 UNION ALL SELECT 2 AS lvl, 7 AS pos, 'Teachings of Lord Kapila' AS title
 UNION ALL SELECT 2 AS lvl, 8 AS pos, 'Teachings of Lord Chaitanya' AS title
 UNION ALL SELECT 2 AS lvl, 9 AS pos, 'Sri Isopanishad' AS title
 UNION ALL SELECT 2 AS lvl, 10 AS pos, 'Krishna Book' AS title
 UNION ALL SELECT 2 AS lvl, 11 AS pos, 'A Second Chance' AS title
 UNION ALL SELECT 2 AS lvl, 12 AS pos, 'Prabhupada Lilamrita (Volume 3)' AS title
 UNION ALL SELECT 2 AS lvl, 13 AS pos, 'Prabhupada Lilamrita (Volume 4)' AS title
 UNION ALL SELECT 2 AS lvl, 14 AS pos, 'Prabhupada Lilamrita (Volume 5)' AS title
 UNION ALL SELECT 2 AS lvl, 15 AS pos, 'Prabhupada Lilamrita (Volume 6)' AS title
 UNION ALL SELECT 3 AS lvl, 1 AS pos, 'Bhagavad Gita As It Is' AS title
 UNION ALL SELECT 3 AS lvl, 2 AS pos, 'Srimad Bhagavatam Canto 1' AS title
 UNION ALL SELECT 3 AS lvl, 3 AS pos, 'Srimad Bhagavatam Canto 2' AS title
 UNION ALL SELECT 3 AS lvl, 4 AS pos, 'Srimad Bhagavatam Canto 3' AS title
 UNION ALL SELECT 3 AS lvl, 5 AS pos, 'Srimad Bhagavatam Canto 4' AS title
 UNION ALL SELECT 3 AS lvl, 6 AS pos, 'Srimad Bhagavatam Canto 5' AS title
 UNION ALL SELECT 3 AS lvl, 7 AS pos, 'Srimad Bhagavatam Canto 6' AS title
 UNION ALL SELECT 3 AS lvl, 8 AS pos, 'Srimad Bhagavatam Canto 7' AS title
 UNION ALL SELECT 3 AS lvl, 9 AS pos, 'Srimad Bhagavatam Canto 8' AS title
 UNION ALL SELECT 3 AS lvl, 10 AS pos, 'Srimad Bhagavatam Canto 9' AS title
 UNION ALL SELECT 3 AS lvl, 11 AS pos, 'Srimad Bhagavatam Canto 10' AS title
 UNION ALL SELECT 3 AS lvl, 12 AS pos, 'Srimad Bhagavatam Canto 11' AS title
 UNION ALL SELECT 3 AS lvl, 13 AS pos, 'Srimad Bhagavatam Canto 12' AS title
 UNION ALL SELECT 3 AS lvl, 14 AS pos, 'Chaitanya Charitamrita (Adi Lila)' AS title
 UNION ALL SELECT 3 AS lvl, 15 AS pos, 'Chaitanya Charitamrita (Madhya Lila)' AS title
 UNION ALL SELECT 3 AS lvl, 16 AS pos, 'Chaitanya Charitamrita (Antya Lila)' AS title
 UNION ALL SELECT 3 AS lvl, 17 AS pos, 'Chaitanya Charitamrita (Complete)' AS title
) x
JOIN reading_books b ON b.title = x.title AND b.created_by IS NULL;

-- CHECK (expect 54 books, 3 levels, 54 plan rows: 22 / 15 / 17):
--   SELECT COUNT(*) FROM reading_books WHERE created_by IS NULL;
--   SELECT l.name, COUNT(*) FROM reading_plan_books pb JOIN reading_plan_levels l ON l.id=pb.level_id GROUP BY l.id;

-- CLEAN-UP (ONLY if you ran the old 7-book placeholder; removes ONLY system
-- books/levels of the default reading plan, never a user's own books):
-- DELETE FROM reading_plan_books  WHERE plan_id = (SELECT id FROM learning_plans WHERE kind='reading' AND scope='default' AND owner_id IS NULL);
-- DELETE FROM reading_plan_levels WHERE plan_id = (SELECT id FROM learning_plans WHERE kind='reading' AND scope='default' AND owner_id IS NULL);
-- DELETE FROM reading_books WHERE created_by IS NULL;
