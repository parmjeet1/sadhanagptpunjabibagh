import db from '../../config/database.js';

/**
 * Service to fetch a student's currently assigned Group and Subgroup.
 * 
 * Rules:
 * - Authoritative source: `user_assignments` joined with `center_list` (group) and `labels_list` (subgroup).
 * - If user_assignments has no row or missing assignment, falls back to `users` center_id/label_id if set.
 * - If no group is assigned, returns `group_id: null, group_name: null`.
 * - If no subgroup is assigned (or label_id is 0 / not found), returns `subgroup_id: null, subgroup_name: null`.
 * - Authorization:
 *   - If authUserType === 'student': may only view their own assignment. Throws 403 if trying to view another student.
 *   - If authUserType === 'counsellor': may view any student connected via `user_counsellors` or `user_assignments`,
 *     or their own profile assignment. Throws 403 if trying to access an unpermitted student.
 * 
 * @param {string} authUserId - The ID of the authenticated user making the request.
 * @param {string} authUserType - 'student' or 'counsellor'.
 * @param {string} [targetStudentId] - The student ID whose assignment is requested. Defaults to authUserId.
 * @returns {Promise<{ student_id: string, student_name: string, group_id: number|null, group_name: string|null, subgroup_id: number|null, subgroup_name: string|null }>}
 */
export async function getStudentGroupAssignment(authUserId, authUserType, targetStudentId) {
  const studentId = targetStudentId || authUserId;

  // 1. Verify target student exists
  const [studentRows] = await db.execute(
    `SELECT user_id, name, email, user_type, center_id, label_id FROM users WHERE user_id = ?`,
    [studentId]
  );

  if (!studentRows || studentRows.length === 0) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  const studentUser = studentRows[0];

  // 2. Authorization checks
  if (authUserType === 'student') {
    // A student can only view their own assignments
    if (studentId !== authUserId) {
      const error = new Error('Access denied. Students can only view their own group assignment.');
      error.statusCode = 403;
      throw error;
    }
  } else if (authUserType === 'counsellor') {
    // If a counsellor is viewing another user (a student/mentee)
    if (studentId !== authUserId) {
      // Check if student belongs to this counsellor via user_counsellors OR user_assignments
      const [permRows] = await db.execute(
        `SELECT 1 FROM user_counsellors WHERE user_id = ? AND counsller_id = ?
         UNION
         SELECT 1 FROM user_assignments WHERE user_id = ? AND counsellor_id = ?
         LIMIT 1`,
        [studentId, authUserId, studentId, authUserId]
      );

      if (!permRows || permRows.length === 0) {
        const error = new Error("Access denied. You do not have permission to view this student's assignment.");
        error.statusCode = 403;
        throw error;
      }
    }
  }

  // 3. Retrieve assignment from authoritative source: user_assignments
  let group_id = null;
  let group_name = null;
  let subgroup_id = null;
  let subgroup_name = null;

  if (authUserType === 'counsellor' && studentId !== authUserId) {
    // Specific assignment by this counsellor
    const [uaRows] = await db.execute(
      `SELECT 
         ua.center_id, 
         c.name AS center_name, 
         ua.label_id, 
         l.name AS label_name
       FROM user_assignments ua
       LEFT JOIN center_list c ON ua.center_id = c.center_id
       LEFT JOIN labels_list l ON ua.label_id = l.id
       WHERE ua.user_id = ? AND ua.counsellor_id = ?
       LIMIT 1`,
      [studentId, authUserId]
    );

    if (uaRows && uaRows.length > 0) {
      const row = uaRows[0];
      if (row.center_id && row.center_name) {
        group_id = row.center_id;
        group_name = row.center_name;
      }
      if (row.label_id && row.label_id !== 0 && row.label_name) {
        subgroup_id = row.label_id;
        subgroup_name = row.label_name;
      }
    }
  } else {
    // Student viewing own assignment or Counsellor viewing own assignment
    const [uaRows] = await db.execute(
      `SELECT 
         ua.center_id, 
         c.name AS center_name, 
         ua.label_id, 
         l.name AS label_name
       FROM user_assignments ua
       LEFT JOIN center_list c ON ua.center_id = c.center_id
       LEFT JOIN labels_list l ON ua.label_id = l.id
       LEFT JOIN user_counsellors uc ON uc.user_id = ua.user_id AND uc.counsller_id = ua.counsellor_id
       WHERE ua.user_id = ?
       ORDER BY (uc.counsllor_type = 'primary') DESC, ua.id DESC
       LIMIT 1`,
      [studentId]
    );

    if (uaRows && uaRows.length > 0) {
      const row = uaRows[0];
      if (row.center_id && row.center_name) {
        group_id = row.center_id;
        group_name = row.center_name;
      }
      if (row.label_id && row.label_id !== 0 && row.label_name) {
        subgroup_id = row.label_id;
        subgroup_name = row.label_name;
      }
    }
  }

  // 4. Fallback to legacy `users` table if user_assignments had no row
  if (!group_name && studentUser.center_id) {
    const [legacyCenter] = await db.execute(
      `SELECT center_id, name FROM center_list WHERE center_id = ?`,
      [studentUser.center_id]
    );
    if (legacyCenter && legacyCenter.length > 0) {
      group_id = legacyCenter[0].center_id;
      group_name = legacyCenter[0].name;
    }
  }

  if (!subgroup_name && studentUser.label_id && studentUser.label_id !== 0) {
    const [legacyLabel] = await db.execute(
      `SELECT id, name FROM labels_list WHERE id = ?`,
      [studentUser.label_id]
    );
    if (legacyLabel && legacyLabel.length > 0) {
      subgroup_id = legacyLabel[0].id;
      subgroup_name = legacyLabel[0].name;
    }
  }

  return {
    student_id: studentUser.user_id,
    student_name: studentUser.name,
    group_id: group_id || null,
    group_name: group_name || null,
    subgroup_id: subgroup_id || null,
    subgroup_name: subgroup_name || null,
  };
}
