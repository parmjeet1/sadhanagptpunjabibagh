-- =====================================================================
-- READING + LECTURES FEATURE: PROPOSED DATABASE CHANGES   (STATUS: PENDING - NOT RUN)
-- Developer: Manvatar Prabhu Ji          Written: 2026-10-09
-- Database: MariaDB 11.x. Run on the TEST database first, by hand.
-- Claude never runs this file. All changes are NEW tables only: no existing
-- table or row is altered, so nothing changes for current users until the
-- new screens are deployed.
--
-- HOW THE DESIGN WORKS (plain English)
--  * Books and lectures live in "master" tables (the system list, plus any a
--    counsellor adds himself).
--  * A "plan" is an ordered list. There is one SYSTEM plan (the default list
--    for everybody) and a counsellor can make his own plan for: all his
--    mentees, one group, or one sub-group.
--  * Which plan a mentee sees (same idea as the marking scheme):
--       sub-group plan -> group plan -> counsellor's "all mentees" plan -> system default.
--  * A book a student/counsellor adds for himself ("another book I am reading")
--    is a normal reading_books row with created_by = that person; it is shown
--    only to him (and his counsellor in the status list), never in anybody's plan.
--  * Titles can be stored in English and Hindi (title / title_hi).
--  * Each person's progress is stored per BOOK / per LECTURE (not per plan),
--    so progress is kept even if the counsellor re-orders the list later.
--  * Groups = center_list.center_id, sub-groups = labels_list.id (as in the
--    existing code).
--
-- CHECK FIRST (read-only). The new tables must use the SAME text type and
-- collation as users.user_id, or the foreign keys fail with error 1215:
--     SHOW CREATE TABLE users;
--     SHOW CREATE TABLE center_list;
--     SHOW CREATE TABLE labels_list;
-- If users.user_id is not VARCHAR(20), or the collation differs, change the
-- user_id columns below to match before running.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RL-001  Master list of books
-- Why: one row per book. created_by NULL = system book (your default list);
--      a counsellor-added book keeps his user_id. vedabase_url lets the app
--      link to the book text (optional).
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reading_books` (
  `id`           BIGINT(20) NOT NULL AUTO_INCREMENT,
  `title`        VARCHAR(255) NOT NULL,
  `title_hi`     VARCHAR(255) NULL DEFAULT NULL COMMENT 'Hindi title (optional)',
  `author`       VARCHAR(150) NOT NULL DEFAULT 'Srila Prabhupada',
  `link`         VARCHAR(500) NULL DEFAULT NULL,
  `cover_image`  VARCHAR(500) NULL DEFAULT NULL,
  `created_by`   VARCHAR(20) NULL DEFAULT NULL COMMENT 'NULL = system book',
  `is_active`    TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rb_created_by` (`created_by`),
  CONSTRAINT `fk_rb_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-002  Master list of lectures
-- Why: one row per lecture (title, speaker, link). created_by NULL = the
--      recommended Prabhupada list you will provide; a counsellor can add
--      his own recommended lectures.
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lectures` (
  `id`          BIGINT(20) NOT NULL AUTO_INCREMENT,
  `title`       VARCHAR(255) NOT NULL,
  `title_hi`    VARCHAR(255) NULL DEFAULT NULL COMMENT 'Hindi title (optional)',
  `speaker`     VARCHAR(150) NOT NULL DEFAULT 'Srila Prabhupada',
  `link`        VARCHAR(500) NULL DEFAULT NULL,
  `topic`       VARCHAR(150) NULL DEFAULT NULL COMMENT 'optional heading, e.g. Bhagavad-gita',
  `created_by`  VARCHAR(20) NULL DEFAULT NULL COMMENT 'NULL = system lecture',
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lec_created_by` (`created_by`),
  CONSTRAINT `fk_lec_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-003  Plans (the ordered lists), for books AND lectures
-- Why: owner_id NULL + scope 'default' = the system list for everybody.
--      A counsellor's own plan has scope 'all' (all his mentees), 'group'
--      (center_id set) or 'subgroup' (label_id set).
--      scope_key is a small helper that makes "one plan per owner+kind+scope"
--      enforceable by the database (NULLs are not compared in unique keys).
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `learning_plans` (
  `id`         BIGINT(20) NOT NULL AUTO_INCREMENT,
  `kind`       ENUM('reading','lecture') NOT NULL,
  `scope`      ENUM('default','all','group','subgroup') NOT NULL,
  `owner_id`   VARCHAR(20) NULL DEFAULT NULL COMMENT 'counsellor user_id; NULL for the system default',
  `center_id`  BIGINT(20) NULL DEFAULT NULL COMMENT 'group, when scope = group',
  `label_id`   BIGINT(20) NULL DEFAULT NULL COMMENT 'sub-group, when scope = subgroup',
  `scope_key`  VARCHAR(80) AS (CONCAT(`kind`,'|',`scope`,'|',IFNULL(`owner_id`,''),'|',IFNULL(`center_id`,0),'|',IFNULL(`label_id`,0))) PERSISTENT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lp_scope` (`scope_key`),
  KEY `idx_lp_owner` (`owner_id`),
  CONSTRAINT `fk_lp_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Note: center_id / label_id are NOT given foreign keys on purpose, so this
-- script does not depend on the exact types of center_list / labels_list. The
-- app deletes a group's plans when the group is deleted (to be coded), or add
-- the foreign keys after checking the types.

-- ---------------------------------------------------------------------
-- RL-004  Reading levels inside a plan  (Level 1, Level 2 ...)
-- Why: lets a counsellor rename, re-order and add levels.
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reading_plan_levels` (
  `id`          BIGINT(20) NOT NULL AUTO_INCREMENT,
  `plan_id`     BIGINT(20) NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `name_hi`     VARCHAR(150) NULL DEFAULT NULL COMMENT 'Hindi level name (optional)',
  `sort_order`  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_rpl_plan` (`plan_id`, `sort_order`),
  CONSTRAINT `fk_rpl_plan` FOREIGN KEY (`plan_id`) REFERENCES `learning_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-005  Books inside a level, in order  (the drag-and-drop order and "+")
-- Why: one row per book per level. A book appears once per plan.
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reading_plan_books` (
  `id`          BIGINT(20) NOT NULL AUTO_INCREMENT,
  `plan_id`     BIGINT(20) NOT NULL,
  `level_id`    BIGINT(20) NOT NULL,
  `book_id`     BIGINT(20) NOT NULL,
  `sort_order`  INT NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'used for a NEW badge on recently added books',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rpb_plan_book` (`plan_id`, `book_id`),
  KEY `idx_rpb_level` (`level_id`, `sort_order`),
  CONSTRAINT `fk_rpb_plan`  FOREIGN KEY (`plan_id`)  REFERENCES `learning_plans` (`id`)      ON DELETE CASCADE,
  CONSTRAINT `fk_rpb_level` FOREIGN KEY (`level_id`) REFERENCES `reading_plan_levels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rpb_book`  FOREIGN KEY (`book_id`)  REFERENCES `reading_books` (`id`)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-006  Lectures inside a lecture plan, in order
-- Why: the recommended lecture list (default or a counsellor's version).
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lecture_plan_items` (
  `id`          BIGINT(20) NOT NULL AUTO_INCREMENT,
  `plan_id`     BIGINT(20) NOT NULL,
  `lecture_id`  BIGINT(20) NOT NULL,
  `sort_order`  INT NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'used for a NEW badge on recently added lectures',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lpi_plan_lecture` (`plan_id`, `lecture_id`),
  KEY `idx_lpi_order` (`plan_id`, `sort_order`),
  CONSTRAINT `fk_lpi_plan`    FOREIGN KEY (`plan_id`)    REFERENCES `learning_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lpi_lecture` FOREIGN KEY (`lecture_id`) REFERENCES `lectures` (`id`)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-007  Each person's book status  (Not Started / Ongoing / Completed)
-- Why: one row per person per book. 'skipped' = the person hid / skipped a
--      recommended book. No row = Not Started (so nothing needs
--      to be created for everybody up front). started_at / completed_at give
--      the counsellor a "completed on" date.
--      Works for students AND counsellors (same user table).
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_book_status` (
  `id`            BIGINT(20) NOT NULL AUTO_INCREMENT,
  `user_id`       VARCHAR(20) NOT NULL,
  `book_id`       BIGINT(20) NOT NULL,
  `status`        ENUM('not_started','ongoing','completed','skipped') NOT NULL DEFAULT 'not_started',
  `started_at`    DATE NULL DEFAULT NULL,
  `completed_at`  DATE NULL DEFAULT NULL,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ubs_user_book` (`user_id`, `book_id`),
  KEY `idx_ubs_book_status` (`book_id`, `status`),
  CONSTRAINT `fk_ubs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ubs_book` FOREIGN KEY (`book_id`) REFERENCES `reading_books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-008  Lectures a person has heard
-- Why: either ticks off a recommended lecture (lecture_id set) or records one
--      the person typed in himself (title / speaker / link; lecture_id empty).
--      Title, speaker and link are always stored here, so the log still reads
--      correctly if the recommended list changes later.
-- Risk: none (new table).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_lecture_log` (
  `id`          BIGINT(20) NOT NULL AUTO_INCREMENT,
  `user_id`     VARCHAR(20) NOT NULL,
  `lecture_id`  BIGINT(20) NULL DEFAULT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `speaker`     VARCHAR(150) NULL DEFAULT NULL,
  `link`        VARCHAR(500) NULL DEFAULT NULL,
  `heard_on`    DATE NULL DEFAULT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ull_user_lecture` (`user_id`, `lecture_id`),
  KEY `idx_ull_user_date` (`user_id`, `heard_on`),
  CONSTRAINT `fk_ull_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ull_lecture` FOREIGN KEY (`lecture_id`) REFERENCES `lectures` (`id`)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- RL-009  The two system plans (empty; the default books/lectures are added
--         after you give me the lists)
-- Risk: none (2 rows).
-- ---------------------------------------------------------------------
INSERT INTO `learning_plans` (`kind`,`scope`,`owner_id`) VALUES ('reading','default',NULL), ('lecture','default',NULL);

-- =====================================================================
-- UNDO (only if needed, removes the new tables; order matters)
-- DROP TABLE IF EXISTS user_lecture_log, user_book_status, lecture_plan_items,
--   reading_plan_books, reading_plan_levels, learning_plans, lectures, reading_books;
-- =====================================================================
