// Shared by the counsellor endpoints (Reading and Lectures): which group / sub-group is meant,
// who the mentees of that scope are, and a small transaction helper. No imports: the database
// is passed in, so everything can be tested against a throwaway database.

const fail = (code, message) => ({ error: { code, message } });

/** 'all' / empty / missing -> null (no filter); a positive whole number -> that number; anything else -> NaN (invalid). */
export const toId = (v) => {
  if (v === undefined || v === null || v === "" || v === "all") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

/**
 * Reads group_id / sub_id from the request and checks both belong to this counsellor.
 * Returns { scope: 'all'|'group'|'subgroup', centerId, labelId, name } or { error: {code, message} }.
 */
export const resolveScope = async (db, me, p) => {
  const g = toId(p.group_id);
  const s = toId(p.sub_id);
  if (Number.isNaN(g) || Number.isNaN(s)) return fail(422, "group_id / sub_id are not valid");
  let group = null;
  let sub = null;
  if (s !== null) {
    [[sub]] = await db.query(`SELECT id, center_id, name FROM labels_list WHERE id = ? AND counsellor_id = ?`, [s, me]);
    if (!sub) return fail(403, "Sub-group not found or access denied.");
  }
  if (g !== null) {
    [[group]] = await db.query(`SELECT center_id, name FROM center_list WHERE center_id = ? AND counsller_id = ?`, [g, me]);
    if (!group) return fail(403, "Group not found or access denied.");
    if (sub && Number(sub.center_id) !== g) return fail(422, "This sub-group does not belong to that group.");
  }
  if (sub && !group) {
    [[group]] = await db.query(`SELECT center_id, name FROM center_list WHERE center_id = ?`, [sub.center_id]);
  }
  if (sub) return { scope: "subgroup", centerId: Number(sub.center_id), labelId: Number(sub.id), name: `${group?.name || "Group"} / ${sub.name}` };
  if (group) return { scope: "group", centerId: Number(group.center_id), labelId: null, name: group.name };
  return { scope: "all", centerId: null, labelId: null, name: "All groups" };
};

/** The plan this counsellor saved for exactly this scope (not the one in effect through fall-back), or null. */
export const findOwnPlan = async (db, kind, me, sc) => {
  const [[plan]] = await db.query(
    `SELECT id FROM learning_plans
     WHERE kind = ? AND owner_id = ? AND scope = ? AND IFNULL(center_id, 0) = ? AND IFNULL(label_id, 0) = ?`,
    [kind, me, sc.scope, sc.centerId || 0, sc.labelId || 0]
  );
  return plan || null;
};

/** Mentees of this counsellor inside the scope (latest group / sub-group of each mentee). */
export const menteesInScope = async (db, me, sc) => {
  const where = [`uc.counsller_id = ?`, `(ua.counsellor_id IS NULL OR ua.counsellor_id = '' OR ua.counsellor_id = uc.counsller_id)`];
  const args = [me];
  if (sc.scope !== "all") { where.push(`ua.center_id = ?`); args.push(sc.centerId); }
  if (sc.scope === "subgroup") { where.push(`ua.label_id = ?`); args.push(sc.labelId); }
  const [rows] = await db.query(
    `SELECT DISTINCT u.user_id, u.name, ua.center_id, ua.label_id, cl.name AS group_name, ll.name AS sub_name
     FROM user_counsellors uc
     JOIN users u ON u.user_id = uc.user_id
     LEFT JOIN user_assignments ua ON ua.id = (SELECT MAX(ua2.id) FROM user_assignments ua2 WHERE ua2.user_id = u.user_id)
     LEFT JOIN center_list cl ON cl.center_id = ua.center_id
     LEFT JOIN labels_list ll ON ll.id = ua.label_id
     WHERE ${where.join(" AND ")}
     ORDER BY u.name, u.user_id`,
    args
  );
  return rows;
};

/** Runs fn(connection) in one transaction when the database is a real pool; a plain run otherwise (tests). */
export const inTransaction = async (db, fn) => {
  if (typeof db.getConnection !== "function") return fn(db);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw error;
  } finally {
    conn.release();
  }
};

export const placeholders = (list) => list.map(() => "?").join(",");
