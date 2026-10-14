import db from "../../../config/database.js";

/**
 * Which marking scheme applies to a person (student OR counsellor).
 *
 *   1. a custom scheme a counsellor gave the person's SUB-GROUP
 *   2. else a custom scheme a counsellor gave the person's GROUP
 *   3. else the person's OWN scheme, if they chose to use it
 *   4. else the default scheme (id 1)
 *
 * A counsellor's allotment overrides the personal scheme without deleting it; if the allotment is
 * removed the personal scheme applies again. A group / sub-group that only carries the default
 * scheme (id 1) counts as "nothing allotted".
 *
 * NO DATABASE CHANGE: the person's own scheme is an ordinary row of marking_schemes
 *   - owner  (counsellor_id) = the person's user_id
 *   - name   = "<user_id> My Marking Scheme"  (always built by the server, never typed by the person)
 *   - is_enabled = 1 means "I use my own scheme", 0 means "I use the default / my counsellor's"
 * Its rules live in marking_rules like any other scheme.
 */

export const PERSONAL_SCHEME_SUFFIX = " My Marking Scheme";

/** The one and only name of a person's own scheme. */
export const personalSchemeName = (userId) => `${userId}${PERSONAL_SCHEME_SUFFIX}`;

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

/**
 * The person's own scheme row, whether it is switched on or not.
 * @returns {Promise<{id:number, name:string, enabled:boolean}|null>}
 */
export const getPersonalScheme = async (userId) => {
  if (!userId) return null;
  const [rows] = await db.query(
    `SELECT id, name, is_enabled FROM marking_schemes
     WHERE counsellor_id = ? AND name = ? ORDER BY id DESC LIMIT 1`,
    [String(userId), personalSchemeName(userId)]
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), name: rows[0].name, enabled: Number(rows[0].is_enabled) === 1 };
};

/** The id of the person's own scheme when they chose to use it, else null. */
export const getPersonalSchemeId = async (userId) => {
  if (!userId) return null;
  const [rows] = await db.query(
    `SELECT id FROM marking_schemes
     WHERE counsellor_id = ? AND name = ? AND is_enabled = 1 ORDER BY id DESC LIMIT 1`,
    [String(userId), personalSchemeName(userId)]
  );
  return rows.length ? Number(rows[0].id) : null;
};

/** Makes the person's own scheme row if it does not exist yet (switched off). */
export const ensurePersonalScheme = async (userId, enabled = false) => {
  const existing = await getPersonalScheme(userId);
  if (existing) return existing;
  const name = personalSchemeName(userId);
  const [res] = await db.query(
    "INSERT INTO marking_schemes (name, counsellor_id, is_enabled) VALUES (?, ?, ?)",
    [name, String(userId), enabled ? 1 : 0]
  );
  return { id: Number(res.insertId), name, enabled: !!enabled };
};

/** SQL piece for "the person's own scheme id when switched on" (userExpr = the user_id column, e.g. u.user_id). */
export const personalSchemeSql = (userExpr = "u.user_id") =>
  `(SELECT ps.id FROM marking_schemes ps
     WHERE ps.counsellor_id = ${userExpr}
       AND ps.name = CONCAT(${userExpr}, '${PERSONAL_SCHEME_SUFFIX}')
       AND ps.is_enabled = 1
     ORDER BY ps.id DESC LIMIT 1)`;

/** SQL expression with the same rule as resolveEffectiveSchemeId (aliases of the joined tables). */
export const effectiveSchemeSql = ({ label = "l", center = "cl", userExpr = "u.user_id" } = {}) =>
  `(CASE
      WHEN ${label}.marking_scheme_id > 1 THEN ${label}.marking_scheme_id
      WHEN ${center}.marking_scheme_id > 1 THEN ${center}.marking_scheme_id
      WHEN ${personalSchemeSql(userExpr)} > 0 THEN ${personalSchemeSql(userExpr)}
      ELSE 1 END)`;

/**
 * Everything needed to resolve one person's scheme. Works for people who have no group assignment
 * at all (e.g. a counsellor's own marks).
 */
export const getSchemeInputs = async (userId) => {
  const [[row]] = await db.query(
    `SELECT ua.center_id, ua.label_id,
            ll.marking_scheme_id AS label_scheme_id,
            cl.marking_scheme_id AS center_scheme_id
     FROM users u
     LEFT JOIN user_assignments ua ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = u.user_id)
     LEFT JOIN labels_list ll ON ll.id = ua.label_id
     LEFT JOIN center_list cl ON cl.center_id = ua.center_id
     WHERE u.user_id = ?`,
    [userId]
  );
  const personal_scheme_id = await getPersonalSchemeId(userId);
  return {
    center_id: row?.center_id ?? null,
    label_id: row?.label_id ?? null,
    label_scheme_id: row?.label_scheme_id ?? null,
    center_scheme_id: row?.center_scheme_id ?? null,
    personal_scheme_id,
  };
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

/**
 * Which of these people are scored with their OWN scheme right now (switched on and not overridden
 * by a counsellor's group / sub-group scheme)? Used for the "Own scheme" tag on the counsellor's lists.
 * @param {string[]} userIds
 * @returns {Promise<Set<string>>}
 */
export const getUsersOnOwnScheme = async (userIds) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const result = new Set();
  if (ids.length === 0) return result;
  const [rows] = await db.query(
    `SELECT u.user_id
     FROM users u
     LEFT JOIN user_assignments ua ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = u.user_id)
     LEFT JOIN labels_list l ON l.id = ua.label_id
     LEFT JOIN center_list cl ON cl.center_id = ua.center_id
     WHERE u.user_id IN (${ids.map(() => "?").join(",")})
       AND COALESCE(l.marking_scheme_id, 0) <= 1
       AND COALESCE(cl.marking_scheme_id, 0) <= 1
       AND ${personalSchemeSql("u.user_id")} > 0`,
    ids
  );
  rows.forEach((r) => result.add(String(r.user_id)));
  return result;
};
