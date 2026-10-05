import db from "../../../config/database.js";

/**
 * Which marking scheme applies to a person (student OR counsellor).
 *
 *   1. a custom scheme a counsellor gave the person's SUB-GROUP
 *   2. else a custom scheme a counsellor gave the person's GROUP
 *   3. else the person's OWN scheme (users.personal_marking_scheme_id)
 *   4. else the default scheme (id 1)
 *
 * A counsellor's allotment therefore overrides a personal scheme without deleting it;
 * if the allotment is removed the personal scheme applies again. A group/sub-group that only
 * carries the default scheme (id 1) counts as "nothing allotted".
 *
 * Safe to deploy before the database column exists (DBnew.md, DB-002): until the column is
 * there the personal scheme is simply treated as "none" and everything behaves as before.
 */

/** Pure rule. All arguments may be null/undefined/strings. Returns a scheme id (number). */
export const resolveEffectiveSchemeId = (labelSchemeId, centerSchemeId, personalSchemeId) => {
  const label = Number(labelSchemeId);
  if (label > 1) return label;
  const center = Number(centerSchemeId);
  if (center > 1) return center;
  const personal = Number(personalSchemeId);
  if (personal > 0) return personal;
  return 1;
};

/** Where the winning scheme comes from: 'subgroup' | 'group' | 'personal' | 'default'. */
export const schemeSource = (labelSchemeId, centerSchemeId, personalSchemeId) => {
  if (Number(labelSchemeId) > 1) return "subgroup";
  if (Number(centerSchemeId) > 1) return "group";
  if (Number(personalSchemeId) > 0) return "personal";
  return "default";
};

// ---- is the database column there yet? (checked lazily, re-checked at most once a minute until it is) ----
const column = { ready: false, checkedAt: 0 };

export const isPersonalSchemeReady = async () => {
  if (column.ready) return true;
  if (Date.now() - column.checkedAt < 60000) return false;
  column.checkedAt = Date.now();
  try {
    const [rows] = await db.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'personal_marking_scheme_id' LIMIT 1`
    );
    column.ready = rows.length > 0;
  } catch (err) {
    console.error("personal scheme column check failed:", err?.message || err);
  }
  return column.ready;
};

/** For tests only. */
export const _resetPersonalSchemeCache = () => { column.ready = false; column.checkedAt = 0; };

/** SQL piece for "the person's own scheme": the column, or NULL while the column does not exist. */
export const personalSchemeSql = async (userAlias = "u") =>
  (await isPersonalSchemeReady()) ? `${userAlias}.personal_marking_scheme_id` : "NULL";

/** SQL expression with the same rule as resolveEffectiveSchemeId (aliases of the joined tables). */
export const effectiveSchemeSql = async ({ label = "l", center = "cl", user = "u" } = {}) => {
  const personal = await personalSchemeSql(user);
  return `(CASE
      WHEN ${label}.marking_scheme_id > 1 THEN ${label}.marking_scheme_id
      WHEN ${center}.marking_scheme_id > 1 THEN ${center}.marking_scheme_id
      WHEN ${personal} > 0 THEN ${personal}
      ELSE 1 END)`;
};

/**
 * Everything needed to resolve one person's scheme, in one query. Works for people who have no
 * group assignment at all (e.g. a counsellor's own marks).
 * @returns {Promise<{center_id, label_id, label_scheme_id, center_scheme_id, personal_scheme_id}>}
 */
export const getSchemeInputs = async (userId) => {
  const personal = await personalSchemeSql("u");
  const [[row]] = await db.query(
    `SELECT ua.center_id, ua.label_id,
            ll.marking_scheme_id AS label_scheme_id,
            cl.marking_scheme_id AS center_scheme_id,
            ${personal} AS personal_scheme_id
     FROM users u
     LEFT JOIN user_assignments ua ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = u.user_id)
     LEFT JOIN labels_list ll ON ll.id = ua.label_id
     LEFT JOIN center_list cl ON cl.center_id = ua.center_id
     WHERE u.user_id = ?`,
    [userId]
  );
  return row || { center_id: null, label_id: null, label_scheme_id: null, center_scheme_id: null, personal_scheme_id: null };
};

/** Inputs + the winning scheme id and where it comes from. */
export const getEffectiveScheme = async (userId) => {
  const inputs = await getSchemeInputs(userId);
  return {
    ...inputs,
    schemeId: resolveEffectiveSchemeId(inputs.label_scheme_id, inputs.center_scheme_id, inputs.personal_scheme_id),
    source: schemeSource(inputs.label_scheme_id, inputs.center_scheme_id, inputs.personal_scheme_id),
  };
};
