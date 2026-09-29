import db from "../../config/database.js";
import fetch from "node-fetch";
import dotenv from 'dotenv';
dotenv.config();
import {
  getPaginatedData,
  insertRecord,
  queryDB,
  updateRecord,
} from "../../utils/dbUtils.js";
import { asyncHandler, mergeParam } from "../../utils/utils.js";
import validateFields from "../../utils/validation.js";
import axios from "axios";
import moment from "moment";
import { generateStudentKPIs } from "../../utils/analyticsUtils.js";
import { chatWithAI, generateStudentInsights } from "../../utils/groqService.js";
import ExcelJS from "exceljs";
import { Parser } from "json2csv";
import { uploadFiles } from "../../utils/fileUpload.js";


export const oldLableList = asyncHandler(async (req, resp) => {

  const request = mergeParam(req);
  const { user_id, center_id } = request;

  if (!user_id || !center_id) {
    return resp.json({
      status: 0,
      code: 422,
      message: ["user_id and center_id are required"]
    });
  }

  try {

    // ✅ Fetch labels mapped to this center & user
    const [labels] = await db.execute(
      `
     SELECT 
  ll.id AS label_id,
  CONCAT(ll.name, ' ', COUNT(u.user_id)) AS label_name,
  COUNT(u.user_id) AS total_students
FROM label_centers lc
INNER JOIN labels_list ll 
  ON lc.label_id = ll.id
LEFT JOIN users u 
  ON u.label_id = ll.id 
  AND u.center_id = lc.center_id   -- important filter
WHERE 
  lc.center_id = ?
  AND ll.counsellor_id = ?
GROUP BY ll.id, ll.name
ORDER BY ll.id DESC;
      `,
      [center_id, user_id]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Label list fetched successfully"],
      data: labels
    });

  } catch (err) {

    console.log("getLableList error:", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });
  }

});
export const LableList = asyncHandler(async (req, resp) => {

  const request = mergeParam(req);
  const { user_id, center_id } = request; // NOTE: user_id is the logged-in counsellor

  if (!user_id || !center_id) {
    return resp.json({
      status: 0,
      code: 422,
      message: ["user_id and center_id are required"]
    });
  }

  try {

    // ✅ Fetch labels mapped to this center & user, but now count students from `user_assignments`
    //CONCAT(ll.name, ' ', COUNT(ua.user_id)) AS label_name 
    const [labels] = await db.execute(
      `
      SELECT 
        ll.id AS label_id,
       ll.name AS label_name
      FROM labels_list ll 
      
      LEFT JOIN user_assignments ua 
        ON ua.label_id = ll.id 
        AND ua.center_id = ll.center_id 
        AND ua.counsellor_id = ? 
      WHERE 
        ll.center_id = ? 
        AND ll.counsellor_id = ?
        
      GROUP BY ll.id, ll.name
      ORDER BY ll.id DESC;
      `,
      [user_id, center_id, user_id]
    );




    return resp.json({
      status: 1,
      code: 200,
      message: ["Label list fetched successfully"],
      data: labels
    });

  } catch (err) {

    console.log("getLableList error:", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });
  }

});

export const addLable = asyncHandler(async (req, resp) => {

  const request = req.body;
  const { user_id, lable_name, center_id } = request;

  // ✅ Validation
  const { isValid, errors } = validateFields(request, {
    user_id: ["required"],
    lable_name: ["required"],
    center_id: ["required"]
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  try {

    // ✅ 1. Check if label already exists for this user
    const [existingLabel] = await db.execute(
      `SELECT id FROM labels_list WHERE counsellor_id = ? AND center_id = ? AND name = ?`,
      [user_id, center_id, lable_name]
    );

    let label_id;

    if (existingLabel.length > 0) {
      label_id = existingLabel[0].id;
    } else {
      // ✅ Create new label
      const labelInsert = await insertRecord(
        "labels_list",
        ["counsellor_id", "center_id", "name"],
        [user_id, center_id, lable_name]
      );

      label_id = labelInsert.insertId;
    }


    return resp.json({
      status: 1,
      code: 200,
      message: ["Label added successfully"],
      data: {
        label_id,
        center_id
      }
    });

  } catch (err) {

    console.log("addLable error:", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });
  }

});
export const editLable = asyncHandler(async (req, resp) => {

  const request = req.body;
  const { user_id, label_id, lable_name } = request;

  const { isValid, errors } = validateFields(request, {
    label_id: ["required"],
    lable_name: ["required"],
    user_id: ["required"]
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  try {

    const updateData = await updateRecord(
      "labels_list",
      {
        name: lable_name

      }
      , ["id", "counsellor_id"],

      [label_id, user_id]
    );

    if (!updateData) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Label not found"]
      });
    }

    return resp.json({
      status: 1,
      code: 200,
      lable_name,
      message: ["Label updated successfully"]
    });

  } catch (err) {

    console.log("editLable error:", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });
  }

});

// ---------------------------------------------------------------------------
// clearLabelReferences — remove/clear every row that still points at the given
// subgroup (labels_list) ids so the labels_list DELETE can't be blocked by a
// foreign-key constraint (which surfaced to the user as a generic 500
// "Internal server error" when deleting a subgroup).
//
//  * user_assignments.label_id  -> set NULL (student keeps account, Sadhna
//    records and Group assignment; they just show as "no subgroup").
//  * label_centers / content_labels / counselor_added_activities -> the rows
//    are pure link/assignment rows scoped to that subgroup, so they're deleted
//    (each guarded: a table/column that doesn't exist in this DB is skipped).
//  * ANY OTHER table that has a real FK to labels_list.id (discovered from
//    information_schema, so we don't depend on guessing the schema): column
//    set NULL when nullable, otherwise the referencing row is deleted.
// ---------------------------------------------------------------------------
async function clearLabelReferences(labelIds) {
  if (!Array.isArray(labelIds) || labelIds.length === 0) return;
  const ph = labelIds.map(() => "?").join(",");

  await db.execute(
    `UPDATE user_assignments SET label_id = NULL WHERE label_id IN (${ph})`,
    labelIds
  );

  // Known link tables. Skipped silently when the table/column doesn't exist
  // (ER_NO_SUCH_TABLE 1146 / ER_BAD_FIELD_ERROR 1054).
  for (const table of ["label_centers", "content_labels", "counselor_added_activities"]) {
    try {
      await db.execute(`DELETE FROM \`${table}\` WHERE label_id IN (${ph})`, labelIds);
    } catch (e) {
      if (e && (e.errno === 1146 || e.errno === 1054)) continue;
      throw e;
    }
  }

  // Any other real foreign key pointing at labels_list.id.
  try {
    const [fks] = await db.execute(
      `SELECT kcu.TABLE_NAME AS tbl, kcu.COLUMN_NAME AS col, c.IS_NULLABLE AS nullable
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.COLUMNS c
           ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND c.TABLE_NAME = kcu.TABLE_NAME
          AND c.COLUMN_NAME = kcu.COLUMN_NAME
        WHERE kcu.TABLE_SCHEMA = DATABASE()
          AND kcu.REFERENCED_TABLE_NAME = 'labels_list'
          AND kcu.REFERENCED_COLUMN_NAME = 'id'`
    );
    const handled = new Set(["user_assignments", "label_centers", "content_labels", "counselor_added_activities"]);
    for (const fk of fks) {
      if (handled.has(fk.tbl)) continue;
      if (fk.nullable === "YES") {
        await db.execute(`UPDATE \`${fk.tbl}\` SET \`${fk.col}\` = NULL WHERE \`${fk.col}\` IN (${ph})`, labelIds);
      } else {
        await db.execute(`DELETE FROM \`${fk.tbl}\` WHERE \`${fk.col}\` IN (${ph})`, labelIds);
      }
    }
  } catch (e) {
    // information_schema unreadable on this DB user — the known-table cleanup
    // above already ran; log and let the final DELETE report the real error.
    console.warn("clearLabelReferences: FK discovery skipped:", e && e.message);
  }
}

export const deleteLable = asyncHandler(async (req, res) => {

  const { user_id, label_id } = mergeParam(req);

  // FIX: this previously validated/looked up label_id ONLY, with no
  // ownership check at all (any counsellor could delete any other
  // counsellor's label by guessing its id) and no cleanup of students
  // already pointing at this label — it relied on an unverified "CASCADE"
  // comment. Now: (1) ownership is checked the same way editLable already
  // does it, and (2) any user_assignments row referencing this label has
  // its label_id cleared FIRST, so affected students fall back to
  // Uncategorised at the subgroup level instead of silently keeping a
  // reference to a label that no longer exists. Students' accounts,
  // Sadhna records and Group assignment are untouched.
  const { isValid, errors } = validateFields(req.body, {
    label_id: ["required"],
    user_id: ["required"]
  });

  if (!isValid) {
    return res.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  try {

    // Check label exists AND belongs to this counsellor
    const [[label]] = await db.execute(
      `SELECT id FROM labels_list WHERE id = ? AND counsellor_id = ?`,
      [label_id, user_id]
    );

    if (!label) {
      return res.json({
        status: 0,
        code: 404,
        message: ["Label not found"]
      });
    }

    // Clear this label from any students currently assigned to it so they
    // show as Uncategorised at the subgroup level rather than pointing at
    // a deleted subgroup. Their Group assignment and all other data is
    // left exactly as-is.
    // FIX (Internal server error on subgroup delete): the DELETE below
    // assumed every other table referencing this label would cascade
    // automatically. It doesn't, so a subgroup with tagged content /
    // subgroup-level activities / any other FK row hit a constraint error
    // that was reported as a generic 500. Clear every referencing row first
    // (also nulls user_assignments.label_id as before).
    try { await clearLabelReferences([label_id]); }
    catch (e) { console.warn("clearLabelReferences failed, will retry via FK error:", e && e.message); }

    // Self-healing delete: if MySQL still refuses because some table we did
    // not know about has a foreign key to this subgroup, the error text names
    // that table + column. Clear exactly those rows and retry (max 10 tables).
    for (let attempt = 0; ; attempt++) {
      try {
        await db.execute(`DELETE FROM labels_list WHERE id = ?`, [label_id]);
        break;
      } catch (e) {
        const m = e && e.sqlMessage && e.sqlMessage.match(/\(`[^`]+`\.`([^`]+)`, CONSTRAINT `[^`]+` FOREIGN KEY \(`([^`]+)`\) REFERENCES `labels_list`/);
        if (!m || attempt >= 10 || (e.errno !== 1451 && e.code !== 'ER_ROW_IS_REFERENCED_2')) throw e;
        const [, tbl, col] = m;
        try {
          await db.execute(`UPDATE \`${tbl}\` SET \`${col}\` = NULL WHERE \`${col}\` = ?`, [label_id]);
        } catch (e2) {
          if (tbl === "user_assignments") throw e2; // never delete a student's group assignment
          await db.execute(`DELETE FROM \`${tbl}\` WHERE \`${col}\` = ?`, [label_id]);
        }
      }
    }

    return res.json({
      status: 1,
      code: 200,
      message: ["Label deleted successfully"]
    });

  } catch (err) {

    console.error("delete label error", err && err.code, err && err.sqlMessage, err);

    return res.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"],
      // DB error class only (e.g. ER_ROW_IS_REFERENCED_2) — no SQL/text — so
      // if this ever recurs the exact cause is visible without server logs.
      error_code: (err && err.code) || null,
      error_detail: (err && err.sqlMessage) ? String(err.sqlMessage).slice(0, 300) : null
    });

  }

});
export const bulkAssignLabel = asyncHandler(async (req, res) => {

  const { user_id, center_id, label_id, student_ids } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    label_id: ["required"],
    student_ids: ["required"],
    user_id: ["required"],
    center_id: ["required"],
  });

  if (!isValid) {
    return res.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  try {

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.json({
        status: 0,
        code: 422,
        message: ["student_ids must be a non-empty array"]
      });
    }

    // Check label exists
    const [[label]] = await db.execute(
      `SELECT center_id FROM label_centers WHERE label_id = ? and  center_id=?`,
      [label_id, center_id]
    );


    if (!label) {
      return res.json({
        status: 0,
        code: 404,
        message: ["Label not found"]
      });
    }


    // Prepare placeholders (?, ?, ?)

    const placeholders = student_ids.map(() => '?').join(',');
    const [students] = await db.execute(
      `SELECT user_id 
       FROM users 
       WHERE user_id IN (${placeholders})
       AND center_id = ?`,
      [...student_ids, label.center_id]
    );

    if (students.length !== student_ids.length) {
      return res.json({
        status: 0,
        code: 403,
        message: ["Some students do not belong to this center"]
      });
    }

    // Bulk update users
    const [result] = await db.execute(
      `UPDATE users 
       SET label_id = ?
       WHERE user_id IN (${placeholders})`,
      [label_id, ...student_ids]
    );

    return res.json({
      status: 1,
      code: 200,
      message: ["Label assigned successfully"],
      data: {
        affected_users: result.affectedRows
      }
    });

  } catch (err) {

    console.log("bulk assign label error", err);

    return res.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});

export const addCenter = asyncHandler(async (req, resp) => {
  try {
    const request = req.body;

    const { user_id, name, city = '', temple_id } = request;

    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      name: ["required"],
      // city: ["required"],
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors,
      });
    }
    
        // ✅ Check if Group name already exists
    const [existingCenter] = await db.execute(
      `SELECT center_id FROM center_list WHERE counsller_id = ? AND name = ?`,
      [user_id, name]
    );

    if (existingCenter.length > 0) {
      return resp.json({
        status: 0,
        code: 409,
        message: ["Group with this name already exists"]
      });
    }

    const temple = await queryDB(
      `SELECT temple_id FROM users WHERE user_id = ?`,
      [user_id]
    );

    // Insert center
    const insert_data = await insertRecord(
      "center_list",
      ["counsller_id", "name", "city", "temple_id"],
      [user_id, name, city, temple.temple_id],
    );

    if (insert_data) {
      return resp.json({
        status: 1,
        code: 200,
        message: ["New Group added successfully!"],
        data: {
          center_id: insert_data.insertId,
        },
      });
    }
  } catch (err) {
    console.log("err", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"],
    });
  }
});


export const editCenter = asyncHandler(async (req, resp) => {

  try {

    const request = req.body;

    const { user_id, center_id, name, city, temple_id } = request;

    // ✅ Validation
    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      center_id: ["required"]
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors
      });
    }

    // ✅ Check center exists
    const center = await queryDB(
      `SELECT center_id, counsller_id
       FROM center_list
       WHERE center_id = ?`,
      [center_id]
    );

    if (!center) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Center not found"]
      });
    }

    // ✅ Security check
    if (center.counsller_id != user_id) {
      return resp.json({
        status: 0,
        code: 403,
        message: ["You are not authorized to edit this center"]
      });
    }

    // ✅ Prepare update fields
    let updateFields = [];
    let updateValues = [];

    if (name) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }

    if (city) {
      updateFields.push("city = ?");
      updateValues.push(city);
    }

    if (temple_id) {
      updateFields.push("temple_id = ?");
      updateValues.push(temple_id);
    }

    if (!updateFields.length) {
      return resp.json({
        status: 0,
        code: 400,
        message: ["Nothing to update"]
      });
    }

    updateValues.push(center_id);

    // ✅ Update center
    await db.execute(
      `UPDATE center_list
       SET ${updateFields.join(", ")}
       WHERE center_id = ?`,
      updateValues
    );

    // ✅ Fetch updated center
    const updatedCenter = await queryDB(
      `SELECT center_id, name, city, temple_id
       FROM center_list
       WHERE center_id = ?`,
      [center_id]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Center updated successfully!"],
      data: updatedCenter[0]
    });

  } catch (err) {

    console.log("err", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});
export const deleteCenter = asyncHandler(async (req, resp) => {

  try {

    const request = req.body;

    const { user_id, center_id } = request;

    // ✅ Validation
    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      center_id: ["required"]
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors
      });
    }

    // ✅ Check center exists
    // FIX: queryDB() (utils/dbUtils.js) destructures `[[results]]` and
    // returns the single matched ROW OBJECT directly (or undefined) — it is
    // NOT an array of rows. This code was checking `center.length === 0`
    // (always undefined/falsy on a plain object, so a missing center never
    // triggered the 404) and then reading `center[0].counsller_id` (`[0]`
    // on a plain object is undefined), which threw and was caught by the
    // outer catch as a 500 "Internal server error" on every delete attempt.
    const center = await queryDB(
      `SELECT center_id AS id, counsller_id
       FROM center_list
       WHERE center_id = ?`,
      [center_id]
    );

    if (!center) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Center not found"]
      });
    }

    // ✅ Security check
    if (center.counsller_id != user_id) {
      return resp.json({
        status: 0,
        code: 403,
        message: ["You are not authorized to delete this center"]
      });
    }

    // ✅ 1. Unassign students from this group's sub-groups
    await db.execute(
      `DELETE FROM user_assignments WHERE center_id = ? AND counsellor_id = ?`,
      [center_id, user_id]
    );

    // ✅ 2. Unassign students from this group (set center_id to NULL)
    await db.execute(
      `UPDATE users SET center_id = NULL WHERE center_id = ?`,
      [center_id]
    );

    // ✅ 3. Delete this group's sub-groups
    // FIX: clear anything still referencing these subgroups (tagged content,
    // subgroup-level activities, other FK rows) first — same root cause as
    // deleteLable() — otherwise a group whose subgroups have any of that
    // fails here with a foreign-key error / 500.
    const [centerLabels] = await db.execute(
      `SELECT id FROM labels_list WHERE center_id = ? AND counsellor_id = ?`,
      [center_id, user_id]
    );
    await clearLabelReferences(centerLabels.map((l) => l.id));
    // Center-wide custom-activity assignments for this group (guarded: skip
    // if the table/column isn't present in this DB).
    try {
      await db.execute(`DELETE FROM counselor_added_activities WHERE center_id = ?`, [center_id]);
    } catch (e) {
      if (!(e && (e.errno === 1146 || e.errno === 1054))) throw e;
    }

    await db.execute(
      `DELETE FROM labels_list WHERE center_id = ? AND counsellor_id = ?`,
      [center_id, user_id]
    );

    // ✅ 4. Delete center
    await db.execute(
      `DELETE FROM center_list
       WHERE center_id = ?`,
      [center_id]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Center deleted successfully!"]
    });

  } catch (err) {

    console.log("err", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});

// ============================================================================
// removeMentee — counsellor-initiated removal of the mentor–mentee
// relationship. This is the mirror of StudentController.js's
// `removeCounsellor` (which lets a STUDENT drop their counsellor) — there
// was previously no equivalent for the counsellor to drop a student.
//
// This ONLY deletes the `user_counsellors` relationship row (and, so the
// student doesn't linger in this counsellor's Group/Subgroup filters
// afterwards, the matching `user_assignments` row for this counsellor).
// It NEVER touches the student's account (`users`), their Sadhna records
// (`daily_report`), or their analytics/summary history — those all live
// keyed by the student's own user_id, independent of any counsellor link.
// ============================================================================
export const removeMentee = asyncHandler(async (req, resp) => {
  const { user_id, student_id } = mergeParam(req); // user_id = the counsellor's own id

  const { isValid, errors } = validateFields({ user_id, student_id }, {
    user_id: ["required"],
    student_id: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  try {
    // Ownership check — only allow removing a relationship that actually
    // exists between THIS counsellor and THIS student.
    const relation = await queryDB(
      `SELECT user_id FROM user_counsellors WHERE user_id = ? AND counsller_id = ?`,
      [student_id, user_id]
    );

    if (!relation) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["This student is not one of your mentees."],
      });
    }

    await db.execute(
      `DELETE FROM user_counsellors WHERE user_id = ? AND counsller_id = ?`,
      [student_id, user_id]
    );

    // Clean up this counsellor's Group/Subgroup assignment for the student
    // too, since it no longer makes sense once they're not a mentee here.
    await db.execute(
      `DELETE FROM user_assignments WHERE user_id = ? AND counsellor_id = ?`,
      [student_id, user_id]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Mentee removed successfully"],
    });
  } catch (err) {
    console.log("removeMentee error:", err);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"],
    });
  }
});

// ============================================================================
// updateMenteeName — lets a counsellor correct/rename a mentee's display
// name (e.g. a typo at signup). Ownership-checked the same way as
// removeMentee above: only ever updates a student who is actually this
// counsellor's mentee. Only touches `users.name` — nothing else about the
// student's account or history.
// ============================================================================
export const updateMenteeName = asyncHandler(async (req, resp) => {
  const { user_id, student_id, name } = mergeParam(req); // user_id = the counsellor's own id

  const { isValid, errors } = validateFields({ user_id, student_id, name }, {
    user_id: ["required"],
    student_id: ["required"],
    name: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  const trimmedName = String(name).trim();
  if (!trimmedName) {
    return resp.json({ status: 0, code: 422, message: ["Name cannot be empty"] });
  }

  try {
    const relation = await queryDB(
      `SELECT user_id FROM user_counsellors WHERE user_id = ? AND counsller_id = ?`,
      [student_id, user_id]
    );

    if (!relation) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["This student is not one of your mentees."],
      });
    }

    await db.execute(`UPDATE users SET name = ? WHERE user_id = ?`, [trimmedName, student_id]);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Mentee name updated successfully"],
      data: { student_id, name: trimmedName },
    });
  } catch (err) {
    console.log("updateMenteeName error:", err);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"],
    });
  }
});

export const studentlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      center_id,
      label_id,
      search_text = "",
      rowSelected,
      categroy,

    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    const params = {
      tableName: "users us",
      columns: `
      uc.performance_notification as notification_status,
      (SELECT ll.name 
       FROM user_assignments ua 
       INNER JOIN labels_list ll ON ll.id = ua.label_id 
       WHERE ua.user_id = us.user_id AND ua.counsellor_id = uc.counsller_id 
       LIMIT 1) as label_name,us.user_id,
       (SELECT cl.name
   FROM user_assignments ua
   INNER JOIN center_list cl ON cl.center_id = ua.center_id
   WHERE ua.user_id = us.user_id
     AND ua.counsellor_id = uc.counsller_id
   LIMIT 1) as center_name 
 ,
      us.name,us.user_type, us.email, us.mobile, us.fcm_token, us.created_at`,
      joinCondition: "us.user_id = uc.user_id",
      joinTable: "user_counsellors uc",

      sortColumn: "us.created_at",
      sortOrder: "DESC",
      page_no,
      limit: rowSelected || 10,
      liveSearchFields: ["name"],
      liveSearchTexts: [search_text],
      whereField: ["uc.counsller_id"],
      whereValue: [user_id],
      whereOperator: ["="],
    };

    if (categroy === 'un-categorized') {
      // Students with NO center assigned in user_assignments for this counsellor
      params.whereField.push(
        `IFNULL((SELECT ua.center_id FROM user_assignments ua WHERE ua.user_id = us.user_id AND ua.counsellor_id = uc.counsller_id LIMIT 1), 0)`
      );
      params.whereValue.push(0);
      params.whereOperator.push("=");
    }
    if (center_id) {
      // Students assigned to a specific center in user_assignments
      params.whereField.push(
        `(SELECT ua.center_id FROM user_assignments ua WHERE ua.user_id = us.user_id AND ua.counsellor_id = uc.counsller_id LIMIT 1)`
      );
      params.whereValue.push(parseInt(center_id)); // ensure it's an int

      params.whereOperator.push("=");
    }
    if (label_id) {
      // Students assigned to a specific label in user_assignments
      params.whereField.push(
        `(SELECT ua.label_id FROM user_assignments ua WHERE ua.user_id = us.user_id AND ua.counsellor_id = uc.counsller_id LIMIT 1)`
      );

      params.whereValue.push(parseInt(label_id)); // ensure it's an int

      params.whereOperator.push("=");
    }

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["users list fetched successfully!"],
      data: result.data,
      total_page: result.totalPage,
      total: result.total,
    }); //
  } catch (error) {
    console.error("Error fetching cycle List:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching cycle List",
    });
  }
});

export const suCounslorList = asyncHandler(async (req, resp) => {
  try {
    const { user_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      user_id: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const [sub_counselor_list] = await db.execute(
      `SELECT 
        u.user_id,
        u.name,
        
        uc.counsllor_type
      FROM users u 
      JOIN user_counsellors uc ON uc.user_id = u.user_id
      WHERE uc.counsller_id = ?
      AND u.user_type = 'counsellor'`,
      [user_id]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Counselor list fetched successfully!"],
      data: sub_counselor_list,
      total: sub_counselor_list.length,
    });

  } catch (error) {
    console.error("Error fetching counselor list:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching counselor list",
    });
  }
});
export const subCounslorCenterlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      sub_counsellor_id,
      search_text = "",
      rowSelected,
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
      sub_counsellor_id: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const params = {
      tableName: "center_list cl",
      columns: `(select count(id) from users u where u.center_id=cl.center_id) as total_student, cl.center_id, cl.name, cl.city, cl.counsller_id`,
      sortColumn: "cl.created_at",
      sortOrder: "DESC",
      page_no,
      limit: rowSelected || 10,
      liveSearchFields: ["cl.name"],
      liveSearchTexts: [search_text],
      whereField: ["cl.counsller_id"],
      whereValue: [sub_counsellor_id],
      whereOperator: ["="],
    };

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Center list fetched successfully!"],
      data: result.data,
      total_page: result.totalPage,
      total: result.total,
    });

  } catch (error) {
    console.error("Error fetching center list:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching center list",
    });
  }
});
export const studentsadhnalist = asyncHandler(async (req, resp) => {
  try {

    const { student_id, user_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      student_id: ["required"],
    });

    if (!isValid)
      return resp.json({ status: 0, code: 422, message: errors });

    /* ---------------------------
       1️⃣ Student basic info
    ----------------------------*/
    const student = await queryDB(
      `SELECT user_id,name,email,mobile,created_at
       FROM users
       WHERE user_id = ?`,
      [student_id]
    );

    if (!student) {
      return resp.json({ status: 0, message: "Student not found" });
    }

    /* ---------------------------
       2️⃣ Attendance summary
    ----------------------------*/
    const attendance = await queryDB(
      `
      SELECT 
        DATEDIFF(CURDATE(), DATE(u.created_at)) + 1 AS total_days,

        COUNT(DISTINCT DATE(dr.activity_date)) AS attended_days,

        (DATEDIFF(CURDATE(), DATE(u.created_at)) + 1) 
        - COUNT(DISTINCT DATE(dr.activity_date)) AS missed_days,

        ROUND(
          (COUNT(DISTINCT DATE(dr.activity_date)) /
          (DATEDIFF(CURDATE(), DATE(u.created_at)) + 1)) * 100,2
        ) AS performance_percentage

      FROM users u
      LEFT JOIN daily_report dr 
      ON dr.user_id = u.user_id

      WHERE u.user_id = ?
      `,
      [student_id]
    );

    /* ---------------------------
       3️⃣ Activity summary
    ----------------------------*/
    const [activitySummary] = await db.execute(
      `
      SELECT 
    fa.activity_id,
    fa.name AS activity_name,

    COUNT(dr.id) AS attendance_count,
    
    DATE_FORMAT(MAX(u.created_at), '%Y-%m-%d') AS joined_date,
    DATE_FORMAT(MAX(dr.activity_date), '%Y-%m-%d') AS last_attended_date,
    
    DATEDIFF(MAX(dr.activity_date), MAX(u.created_at)) AS total_days,
    ROUND((COUNT(dr.id) / DATEDIFF(MAX(dr.activity_date), u.created_at)) * 100, 2) 
AS performance_percentage
    

FROM fix_activities fa

  LEFT JOIN daily_report dr 
    ON dr.activity_id = fa.activity_id  AND dr.user_id = ?
  JOIN users u ON u.user_id = ?
    WHERE
         fa.user_id = ? GROUP BY fa.activity_id
      `,
      [student_id, student_id, student_id]
    );

    /* ---------------------------
       4️⃣ Daily chart data
    ----------------------------*/


    return resp.json({
      status: 1,
      student: student[0],
      attendance: attendance[0],
      activity_summary: activitySummary
    });

  } catch (error) {
    console.error(error);
    resp.json({ status: 0, message: "Server error" });
  }
});

export const studentActivityDetail = asyncHandler(async (req, res) => {
  const { student_id, activity_id, user_id, start_date, end_date, filter = '7days' } = mergeParam(req);
  const { isValid, errors } = validateFields(mergeParam(req), {
    student_id: ["required"],
    activity_id: ["required"],
  });

  if (!isValid) return res.json({ status: 0, code: 422, message: errors });
  let start_formatted_date;
  let end_formatted_date;

  const today_moment = moment();
  switch (filter) {

    case "30days":
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment.clone().subtract(29, "days").format("YYYY-MM-DD");
      break;

    case "custom":
      start_formatted_date = moment(start_date).format("YYYY-MM-DD");
      end_formatted_date = moment(end_date).format("YYYY-MM-DD");
      break;

    case "7days":
    default:
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment.clone().subtract(6, "days").format("YYYY-MM-DD");
  }


  console.log("filter", filter, start_formatted_date, end_formatted_date)

  const today = moment().format("YYYY-MM-DD");

  if (moment(end_formatted_date).isAfter(today)) {
    end_formatted_date = today;
  }
  let dates = [];

  let current = moment(start_formatted_date);

  while (current.isSameOrBefore(end_formatted_date)) {
    dates.push(current.format("YYYY-MM-DD"));
    current.add(1, "days");
  }

  // console.log(dates);

  const [chartData] = await db.execute(
    `
      SELECT 
       DATE_FORMAT(dr.activity_date,'%Y-%m-%d') as date
       , 1 as count
from daily_report dr where 
      dr.user_id = ?
      AND dr.activity_id = ?
      and DATE(dr.activity_date) BETWEEN ? AND ?
      order by dr.id ASC

      `,
    [student_id, activity_id, start_date, end_date]
  );
  const dataMap = {};
  chartData.forEach(item => {
    dataMap[item.date] = item.count;
  });
  let currentStreak = 0;
  let bestStreak = 0;

  const mergedData = dates.map(date => {

    const count = dataMap[date] || 0;

    if (count === 1) {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }

    return {
      date,
      count
    };
  });


  // merge with full date list
  // const mergedData = dates.map(date => ({
  //   date,
  //   count: dataMap[date] || 0
  // }));      

  /* ---------------------------
      Activity summary
  ----------------------------*/
  const [student_data] = await db.execute(
    `
      SELECT
      
CASE 
    WHEN fa.activity_type IN ('numb','min')
        THEN ROUND(AVG(CAST(dr.count AS DECIMAL(10,2))),2)

    WHEN fa.activity_type = 'time'
        THEN SEC_TO_TIME(AVG(TIME_TO_SEC(dr.count)))

    ELSE NULL
END AS average_value,
      u.name AS student_name,
      u.email,
      u.mobile,
      u.user_type, 
    fa.activity_id,
    fa.name AS activity_name,
     fa.description,fa.unit,fa.activity_type,

    COUNT(dr.id) AS attendance_count,
    
    DATE_FORMAT(MAX(u.created_at), '%Y-%m-%d') AS joined_date,
    DATE_FORMAT(MAX(dr.activity_date), '%Y-%m-%d') AS last_attended_date,
    
    DATEDIFF(MAX(dr.activity_date), MAX(u.created_at)) AS total_days,
    ROUND((COUNT(dr.id) / DATEDIFF(MAX(dr.activity_date), u.created_at)) * 100, 2) 
AS user_performance_percentage
FROM fix_activities fa

  LEFT JOIN daily_report dr 
    ON dr.activity_id = fa.activity_id  AND dr.user_id = ?
  JOIN users u ON u.user_id = ?
    WHERE
         fa.activity_id = ?  OR fa.user_id = ? GROUP BY fa.activity_id
      `,
    [student_id, student_id, activity_id, user_id]
  );

  const attendance_days = student_data[0].attendance_count
  const total_days = moment(end_formatted_date).diff(moment(start_formatted_date), "days") + 1;
  const performance_filter = ((attendance_days / total_days) * 100).toFixed(2);
  student_data[0].performance_filter = performance_filter;
  //
  student_data[0].bestStreak = bestStreak;


  // console.log(attendance_days,end_formatted_date,start_formatted_date,"student data",performance);
  return res.json({
    status: 1,
    data: { student_data, chart_data: mergedData }
    //  data:{
    //    ...activity[0],
    //    history
    //  }
  });

});



export const centerlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      search_text = "",
      rowSelected,
    } = mergeParam(req);

    // const { isValid, errors } = validateFields(mergeParam(req), {
    //   // page_no: ["required"],
    // });
    // if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    /*
        center list
        name,
city,student count as per center list
        */
    const params = {
      tableName: "center_list cl",
      columns: `cl.center_id, cl.name, cl.city, (SELECT COUNT(DISTINCT ua.user_id) FROM user_assignments ua INNER JOIN user_counsellors uc ON uc.user_id = ua.user_id AND uc.counsller_id = ua.counsellor_id INNER JOIN users u ON u.user_id = uc.user_id WHERE ua.center_id = cl.center_id AND ua.counsellor_id COLLATE utf8mb4_unicode_ci = cl.counsller_id COLLATE utf8mb4_unicode_ci) AS total_student`,
      //    joinCondition :'cl.group_id = uc.group_id',
      // joinTable :'user_counsellors uc',

      sortColumn: "cl.created_at",
      sortOrder: "DESC",
      page_no,
      limit: rowSelected || 10,
      liveSearchFields: ["name"],
      liveSearchTexts: [search_text],
      whereField: ["cl.counsller_id"],
      whereValue: [user_id],
      whereOperator: ["="],
    };

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["center list fetched successfully!"],
      data: result.data,
      total_page: result.totalPage,
      total: result.total,
    }); //
  } catch (error) {
    console.error("Error fetching cycle List:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching cycle List",
    });
  }
});
export const sadhanReportlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      student_id,
      search_text = "",
      rowSelected,
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const params = {
      tableName: "daily_report dr",
      columns: `fa.activity_id, fa.name, fa.description, DATE_FORMAT(dr.activity_date, '%Y-%m-%d')as activity_date , fa.unit`,
      joinTable: "fix_activities fa",
      joinCondition: "fa.activity_id = dr.activity_id",
      sortColumn: "dr.created_at",
      sortOrder: "DESC",
      page_no,
      limit: rowSelected || 10,
      liveSearchFields: ["fa.name"],
      liveSearchTexts: [search_text],
      whereField: ["dr.user_id"],
      whereValue: [student_id],
      whereOperator: ["="],
    };

    const result = await getPaginatedData(params);

    const student = await queryDB(
      `SELECT user_id,name FROM users WHERE user_id = ?`,
      [student_id],
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["users list fetched successfully!"],
      student,
      data: result.data,
      total_page: result.totalPage,
      total: result.total,
    }); //
  } catch (error) {
    console.error("Error fetching student report List:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching student report List",
    });
  }
});
export const oldstudentlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      center_id,
      search_text = "",
      rowSelected,
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const params = {
      tableName: "users us",

      columns: `
    us.user_id,
    us.name,
    COUNT(DISTINCT DATE(dr.activity_date)) AS attended_days
  `,
      join_reference: "for_stuent_list",
      joins: [
        {
          type: "JOIN",
          table: "user_counsellors uc",
          condition: "us.user_id = uc.user_id"
        },
        {
          type: "LEFT JOIN",
          table: "daily_report dr",
          condition: "dr.user_id = us.user_id"
        }
      ],

      whereField: ["uc.counsller_id"],
      whereValue: [user_id],
      whereOperator: ["="],

      sortColumn: "us.created_at",
      sortOrder: "DESC",
    };
    if (center_id) {
      console.log("center id", center_id);
      params.whereField.push("us.center_id");
      params.whereValue.push(center_id);
      params.whereOperator.push("=");
    }

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["users list fetched successfully!"],
      data: result,
      total_page: result.totalPage,
      total: result.total,
    }); //
  } catch (error) {
    console.error("Error fetching cycle List:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching cycle List",
    });
  }
});
export const assignStudentToCenter = asyncHandler(async (req, resp) => {

  try {

    const request = req.body;

    const { user_id, student_id, center_id } = request;

    // ✅ Validation
    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      student_id: ["required"],
      center_id: ["required"]
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors
      });
    }

    // ✅ Check center exists
    const center = await queryDB(
      `SELECT center_id AS id, counsller_id
       FROM center_list
       WHERE center_id = ?`,
      [center_id]
    );

    if (!center) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Center not found"]
      });
    }

    // ✅ Security check
    if (center.counsller_id != user_id) {
      return resp.json({
        status: 0,
        code: 403,
        message: ["You are not authorized to assign students to this center"]
      });
    }

    // ✅ Check student exists
    const student = await queryDB(
      `SELECT id, center_id
       FROM users
       WHERE id = ?`,
      [student_id]
    );

    if (!student) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Student not found"]
      });
    }

    // ✅ Assign student to center
    await queryDB(
      `UPDATE users
       SET center_id = ?
       WHERE id = ?`,
      [center_id, student_id]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Student assigned to center successfully"]
    });

  } catch (err) {

    console.log("err", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});

export const oldbulkAssignStudents = asyncHandler(async (req, resp) => {

  try {

    const request = req.body;
    console.log("bulk assign request", request);

    const { user_id, center_id, label_id, student_ids = [] } = request;

    // validation
    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      center_id: ["required"],
      student_ids: ["required"]
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors
      });
    }

    if (!Array.isArray(student_ids) || !student_ids.length) {
      return resp.json({
        status: 0,
        code: 400,
        message: ["student_ids must be an array"]
      });
    }

    // check center exists
    const center = await queryDB(
      `SELECT center_id AS id, counsller_id
       FROM center_list
       WHERE center_id = ?`,
      [center_id]
    );

    if (!center) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Center not found"]
      });
    }


    // bulk update
    const placeholders = student_ids.map(() => '?').join(',');

    // ✅ Build dynamic query
    let query = `UPDATE users SET center_id = ?`;
    let params = [center_id];

    // 👉 If label_id मौजूद है तो update करो
    if (label_id) {
      query += `, label_id = ?`;
      params.push(label_id);
    }

    query += ` WHERE user_id IN (${placeholders})`;
    params.push(...student_ids);

    const updateResult = await db.execute(query, params);
    if (updateResult) {
      return resp.json({
        status: 1,
        code: 200,
        message: ["Students updated successfully"],
        data: {
          affected_rows: updateResult.affectedRows,
          label_updated: !!label_id
        }
      });
    }


  } catch (err) {

    console.log(err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});
export const bulkAssignStudents = asyncHandler(async (req, resp) => {
  try {
    const request = req.body;
    console.log("bulk assign request", request);

    // Note: `user_id` from the request is the Counsellor's ID
    const { user_id, center_id, label_id, student_ids = [] } = request;

    // validation
    const validationRules = {
      user_id: ["required"],
      student_ids: ["required"]
    };
    if (center_id !== 0 && center_id !== "0") {
      validationRules.center_id = ["required"];
    }

    const { isValid, errors } = validateFields(request, validationRules);

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    if (!Array.isArray(student_ids) || !student_ids.length) {
      return resp.json({ status: 0, code: 400, message: ["student_ids must be an array"] });
    }

    // check center exists if not 0
    if (center_id !== 0 && center_id !== "0") {
      const center = await queryDB(
        `SELECT center_id AS id, counsller_id FROM center_list WHERE center_id = ?`,
        [center_id]
      );

      if (!center || (Array.isArray(center) && center.length === 0)) {
        return resp.json({ status: 0, code: 404, message: ["Center not found"] });
      }
    }

    // ✅ Build dynamic Bulk Insert/Upsert query
    let values = [];
    let placeholders = [];
    const _label_id = label_id || 0; // Fallback so SQL doesn't crash on NOT NULL

    for (const student_id of student_ids) {
      placeholders.push('(?, ?, ?, ?)');
      // Table mapping: user_id (Student), counsellor_id (Request User), center_id, label_id
      values.push(student_id, user_id, center_id, _label_id);
    }

    // 👉 Dynamically construct the duplicate update string (ignore label if not provided)
    let duplicateUpdateStr = "center_id = VALUES(center_id)";
    if (label_id) {
      duplicateUpdateStr += ", label_id = VALUES(label_id)";
    }

    const query = `
      INSERT INTO user_assignments (user_id, counsellor_id, center_id, label_id)
      VALUES ${placeholders.join(',')}
      ON DUPLICATE KEY UPDATE ${duplicateUpdateStr};
    `;
    console.log(query)
    // Assuming queryDB or db.execute operates identically:
    const updateResult = await db.execute(query, values);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Students assigned successfully"],
      data: {
        affected_rows: updateResult?.affectedRows || student_ids.length,
        label_updated: !!label_id
      }
    });

  } catch (err) {
    console.error("Bulk Assign Error:", err);
    return resp.status(500).json({ status: 0, code: 500, message: ["Internal server error"] });
  }
});


export const aiReport = asyncHandler(async (req, resp) => {
  try {

    const { student_id, date_from, date_to } = mergeParam(req);

    /* --------------------------
       1️⃣ Student Info
    ---------------------------*/
    const student = await queryDB(
      `SELECT user_id,name,DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
       FROM users
       WHERE user_id = ?`,
      [student_id]
    );

    if (!student) {
      return resp.json({ status: 0, message: "Student not found" });
    }

    /* --------------------------
       2️⃣ Activity Records
    ---------------------------*/
    // FIX: dr.activity_id already uniquely identifies exactly one
    // fix_activities row, which already belongs to exactly one user (its
    // own fa.user_id) regardless of whether it's flagged public (own_by=0)
    // or custom (own_by=1) — own_by is only ever a descriptive flag on THAT
    // same student's own row, never a marker for a row shared across
    // multiple students. An earlier version of this fix added
    // "OR fa.own_by = 0" to the join, thinking own_by=0 meant "a shared
    // master row" — it does not, and every OTHER student's own own_by=0
    // rows share that same flag, so that condition matched every public
    // activity belonging to EVERY student in the whole app, not just this
    // one, producing dozens of duplicate same-named ("Chanting" etc.)
    // entries per student, every one of them showing 0 (since dr.user_id is
    // already scoped to just this student in the WHERE clause, none of
    // those OTHER students' activity_ids ever have a matching daily_report
    // row here). The plain join below is the same pattern already used
    // correctly for the student's own working Analytics tab
    // (StudentController.js) — no own_by condition needed at all.
    // Also: LEFT JOIN + COALESCE so a deleted activity definition doesn't
    // drop the row, and the missing comma after fa.own_by (a real SQL
    // syntax error in the original) is fixed.
    const [rows] = await db.execute(
      `SELECT
        dr.activity_date,
        dr.activity_id,
        COALESCE(fa.name, 'Unknown Activity') as activity_name,
        fa.own_by,
        dr.count,
        dr.unit
      FROM daily_report dr
      LEFT JOIN fix_activities fa
      ON fa.activity_id = dr.activity_id
      WHERE dr.user_id = ?
      AND dr.activity_date BETWEEN ? AND ?
      ORDER BY dr.activity_date`,
      [student_id, date_from, date_to]
    );


    /* --------------------------
       3️⃣ Convert to JSON format
    ---------------------------*/

    const dailyMap = {};

    rows.forEach(r => {

      const date = r.activity_date.toISOString().split("T")[0];

      if (!dailyMap[date]) {
        dailyMap[date] = {
          date: date,
          activities: []
        };
      }

      dailyMap[date].activities.push({
        activity_id: r.activity_id,
        activity_name: r.activity_name,
        count: r.count,
        unit: r.unit,
        own_by: r.own_by
      });

    });

    const daily_report = Object.values(dailyMap);

    /* --------------------------
       4️⃣ Final JSON for AI
    ---------------------------*/

    const report = {
      student: {
        user_id: student.user_id,
        name: student.name,
        joined_on: student.created_at
      },
      report_period: {
        from_date: date_from,
        to_date: date_to
      },
      daily_report
    };
    //  const aiReport= await getSadhanaAIAnalysis(report)
    // console.log("aiReport", aiReport);
    return resp.json({
      status: 1,
      data: report
    });

  } catch (error) {
    console.error(error);
    resp.json({ status: 0, message: "Server error" });
  }
});
export const bulkaiReport = asyncHandler(async (req, resp) => {
  try {
    const { user_id, student_ids, date_from, date_to } = mergeParam(req);

    // 1️⃣ Validate student IDs (expecting an array of IDs like: ["U0000001", "U0000002"])
    let parsedStudentIds = student_ids;
    if (typeof student_ids === 'string') {
      // If it comes through as a stringified array from frontend
      parsedStudentIds = JSON.parse(student_ids);
    }

    if (!parsedStudentIds || !Array.isArray(parsedStudentIds) || parsedStudentIds.length === 0) {
      return resp.json({ status: 0, message: "No students provided" });
    }

    /* --------------------------
       2️⃣ Students Info (Multiple)
    ---------------------------*/
    // Create dynamic question marks like "?, ?, ?" for the IN clause
    const placeholders = parsedStudentIds.map(() => '?').join(',');

    const [students] = await db.execute(
      `SELECT 
         u.user_id, 
         u.name, 
         DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
         c.name AS center_name,
         l.name AS label_name
       FROM users u
       LEFT JOIN center_list c ON u.center_id = c.center_id
       LEFT JOIN labels_list l ON u.label_id = l.id
       WHERE u.user_id IN (${placeholders})`,
      [...parsedStudentIds]
    );

    if (!students || students.length === 0) {
      return resp.json({ status: 0, message: "No valid students found" });
    }

    // Set up a structured map for fast lookup
    const studentDataMap = {};
    students.forEach(s => {
      studentDataMap[s.user_id] = {
        student: {
          user_id: s.user_id,
          name: s.name,
          lable_name: s.label_name,
          center_name: s.center_name,
          joined_on: s.created_at
        },
        dailyMap: {} // Map to hold dates for this specific student
      };
    });

    /* --------------------------
       3️⃣ Activity Records (Multiple)
    ---------------------------*/
    // const [rows] = await db.execute(
    //   `SELECT
    //      dr.user_id,
    //     dr.activity_date,
    //     dr.activity_id,
    //     fa.name as activity_name,
    //     fa.target,
    //     dr.count

    //   FROM daily_report dr
    //   LEFT JOIN fix_activities fa 
    //   ON fa.activity_id = dr.activity_id and fa.own_by = 0
    //   WHERE dr.user_id IN (${placeholders})
    //   AND dr.activity_date BETWEEN ? AND ?
    //   ORDER BY dr.activity_date`,
    //   [...parsedStudentIds, date_from, date_to]
    // );
    // NOTE on the join below (this was the main cause of student data being
    // incomplete in the AI analysis, and later of duplicate zero-value
    // "Chanting" etc. cards on the counsellor-side student report):
    //  - It used to be an INNER JOIN restricted to `fa.own_by = 0` (global/
    //    public activities only), which silently dropped every logged entry
    //    for a student's own custom/counsellor-assigned activities
    //    (own_by = 1) from the report sent to the AI.
    //  - A LATER fix mistakenly added "OR fa.own_by = 0" to try to bring
    //    those back — but own_by is only ever a flag on that ROW's own
    //    fa.user_id, never a marker for a row shared across students, so
    //    that condition matched every public activity belonging to EVERY
    //    student in the whole app, not just the ones in this report,
    //    producing dozens of duplicate same-named entries per student (all
    //    showing 0, since dr.user_id is already scoped correctly and none
    //    of those other students' activity_ids have a matching row here).
    //  - dr.activity_id already uniquely identifies exactly one
    //    fix_activities row belonging to exactly one user, so the join
    //    needs no own_by/user_id condition at all — same plain pattern
    //    already used correctly for the student's own working Analytics
    //    tab (StudentController.js).
    //  - Still a LEFT JOIN so a `daily_report` row is never dropped just
    //    because its `fix_activities` definition was later deleted/
    //    deactivated — the activity name falls back to "Unknown Activity"
    //    instead of losing the whole row.
    //  - `dr.unit` is still selected (it was referenced below as `r.unit`
    //    but was never actually in the SELECT list before, so it was
    //    always undefined).
    const [rows] = await db.execute(
      `SELECT
         dr.user_id,
         dr.activity_date,
         dr.activity_id,
         COALESCE(fa.name, 'Unknown Activity') as activity_name,
         fa.target,
         fa.own_by,
         dr.count,
         dr.unit
      FROM daily_report dr
      LEFT JOIN fix_activities fa
        ON fa.activity_id = dr.activity_id
      WHERE dr.user_id IN (${placeholders})
      AND dr.activity_date BETWEEN ? AND ?
      ORDER BY dr.activity_date`,
      [...parsedStudentIds, date_from, date_to]
    );

    console.log("activity rows", rows);
    /* --------------------------
       4️⃣ Convert to nested JSON structure
    ---------------------------*/
    rows.forEach(r => {
      // Ensure safe parsing of dates
      const date = new Date(r.activity_date).toISOString().split("T")[0];
      const userId = r.user_id;

      if (!studentDataMap[userId]) return;

      if (!studentDataMap[userId].dailyMap[date]) {
        studentDataMap[userId].dailyMap[date] = {
          date: date,
          activities: []
        };
      }

      studentDataMap[userId].dailyMap[date].activities.push({
        activity_id: r.activity_id,
        activity_name: r.activity_name,
        count: r.count,
        unit: r.unit,
        target: r.target,
        own_by: r.own_by
      });
    });

    /* --------------------------
       5️⃣ Final JSON for AI
    ---------------------------*/
    // Extract everything into a clean array
    const students_report = Object.values(studentDataMap).map(s => {
      return {
        student: s.student,
        daily_report: Object.values(s.dailyMap)
      };
    });

    const report = {
      report_period: {
        from_date: date_from,
        to_date: date_to
      },
      students_report
    };

    // const aiReport = await getSadhanaAIAnalysis(report)
    // console.log("aiReport", aiReport);

    return resp.json({
      status: 1,
      data: report
    });

  } catch (error) {
    console.error(error);
    resp.json({ status: 0, message: "Server error" });
  }
});

export const studentDetails = asyncHandler(async (req, res) => {
  const { user_id, student_id, start_date, end_date, filter = "7days" } = mergeParam(req);

  // 1: Required validation for both IDs
  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
    student_id: ["required"]
  });

  if (!isValid) {
    return res.json({ status: 0, code: 422, message: errors });
  }

  // 2: Fix the SQL syntax error (added `=`)
  // const [students] = await db.execute(
  //     `SELECT 
  //        u.user_id, 
  //        u.birthday,
  //        u.email,
  //        u.name, 
  //        DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
  //        c.name AS center_name,
  //        l.name AS label_name
  //      FROM users u
  //      LEFT JOIN center_list c ON u.center_id = c.center_id
  //      LEFT JOIN labels_list l ON u.label_id = l.id
  //      WHERE u.user_id = ?`, 
  //     [student_id]
  // );

  const [students] = await db.execute(
    `SELECT 
     u.user_id, 
     u.birthday,
     u.email,
     u.name, 
     DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
     c.name AS center_name,
     l.name AS label_name
   FROM users u

   LEFT JOIN user_assignments ua ON u.user_id = ua.user_id AND ua.counsellor_id = ?
   -- 2. Fetch the center and label names from the assignment!
   LEFT JOIN center_list c ON ua.center_id = c.center_id
   LEFT JOIN labels_list l ON ua.label_id = l.id
   
   WHERE u.user_id = ?`,
    [user_id, student_id]
  );


  // Failsafe in case student doesn't exist
  if (!students || students.length === 0) {
    return res.json({ status: 0, code: 404, message: "Student not found" });
  }

  /* ---------------------------
     DATE FILTER LOGIC
  ----------------------------*/
  let start_formatted_date;
  let end_formatted_date;

  const today_moment = moment();

  switch (filter) {
    case "30days":
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment.clone().subtract(29, "days").format("YYYY-MM-DD");
      break;

    case "custom":
      start_formatted_date = moment(start_date).format("YYYY-MM-DD");
      end_formatted_date = moment(end_date).format("YYYY-MM-DD");
      break;

    case "7days":
    default:
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment.clone().subtract(6, "days").format("YYYY-MM-DD");
  }

  const today = moment().format("YYYY-MM-DD");
  if (moment(end_formatted_date).isAfter(today)) {
    end_formatted_date = today;
  }

  /* ---------------------------
     GENERATE DATE RANGE ARRAY
  ----------------------------*/
  let dates = [];
  let current = moment(start_formatted_date);

  while (current.isSameOrBefore(end_formatted_date)) {
    dates.push(current.format("YYYY-MM-DD"));
    current.add(1, "days");
  }

  /* ---------------------------
     FETCH DAILY ACTIVITY DATA
  ----------------------------*/
  const [dailyActivityData] = await db.execute(
    `
    SELECT 
      dr.activity_id,
      DATE_FORMAT(dr.activity_date,'%Y-%m-%d') as activity_date,
      dr.count
    FROM daily_report dr
    WHERE dr.user_id = ?
    AND DATE(dr.activity_date) BETWEEN ? AND ?
    ORDER BY dr.activity_date ASC
    `,
    [student_id, start_formatted_date, end_formatted_date]
  );

  const activityMap = {};

  dailyActivityData.forEach((item) => {
    if (!activityMap[item.activity_id]) {
      activityMap[item.activity_id] = {};
    }
    activityMap[item.activity_id][item.activity_date] = item.count;
  });

  /* ---------------------------
     FETCH ACTIVITY SUMMARY
  ----------------------------*/
  // FIX — this query has now been through two bugs:
  //   1. Originally: WHERE fa.user_id = ? AND fa.own_by = 0 — matched an
  //      activity only if it was BOTH this student's own row AND flagged
  //      global, excluding this same student's own custom (own_by = 1)
  //      activities outright. For most students this matched zero rows, so
  //      activities_analytics came back empty — the "eye" icon screen
  //      showed no charts at all.
  //   2. A later fix changed the AND to OR ("fa.own_by = 0 OR
  //      fa.user_id = ?"), on the mistaken assumption that own_by = 0 rows
  //      are shared master rows not tied to any one student. They are not:
  //      every fix_activities row (own_by 0 or 1) already carries its own
  //      owning user_id — own_by is only a descriptive public/custom flag
  //      on that SAME student's row. "OR fa.own_by = 0" therefore matched
  //      every public activity belonging to EVERY student in the whole
  //      app, producing dozens of duplicate same-named ("Chanting" etc.)
  //      cards, every one of them at 0 (since the LEFT JOIN above already
  //      scopes dr.user_id to just this one student, so none of those
  //      other students' activity_ids have a matching daily_report row
  //      here).
  // Correct filter is simply this student's own rows, own_by regardless —
  // the same plain pattern already used correctly for the student's own
  // working Analytics tab (StudentController.js, e.g. its personal-report
  // query: "WHERE fa.user_id = ?", no own_by condition at all).
  const [student_data] = await db.execute(
    `
    SELECT
      CASE 
        WHEN fa.activity_type IN ('numb','min')
          THEN ROUND(AVG(CAST(dr.count AS DECIMAL(10,2))),2)

        WHEN fa.activity_type = 'time'
          THEN SEC_TO_TIME(AVG(TIME_TO_SEC(dr.count)))

        ELSE NULL
      END AS average_value,

      fa.activity_id,
      fa.name AS activity_name,
      fa.description,
      fa.unit,
      fa.activity_type,

      COUNT(dr.id) AS attendance_count

    FROM fix_activities fa
    LEFT JOIN daily_report dr
      ON dr.activity_id = fa.activity_id
      AND dr.user_id = ?
    WHERE fa.user_id = ?
    GROUP BY
      fa.activity_id,
      fa.name,
      fa.description,
      fa.unit,
      fa.activity_type
    `,
    [student_id, student_id]
  );

  /* ---------------------------
     BUILD FINAL RESPONSE
  ----------------------------*/
  const colors = ["#1a73e8", "#20c997", "#f59f00", "#e64980"];

  const activities_analytics = student_data.map((activity, index) => {
    const daily_data = dates.map((date) => ({
      activity_date: date,
      count: activityMap?.[activity.activity_id]?.[date] || 0,
    }));

    /* -------- Trend Logic -------- */
    // Note: Trend math works well for numbers, it might be inaccurate for Time ('H:M:S') strings unless parsed!
    const last = daily_data[daily_data.length - 1]?.count || 0;
    const prev = daily_data[daily_data.length - 2]?.count || 0;

    let trend = "Stable";
    if (last > prev) trend = "+";
    else if (last < prev) trend = "-";

    let label = "";
    if (activity.activity_type === "time") label = "Avg. Time";
    else if (activity.unit === "min") label = "Avg. Minutes";
    else label = "Avg. Count";

    return {
      activity_id: activity.activity_id,
      name: activity.activity_name,
      value: activity.average_value,
      label,
      trend,
      color: colors[index % colors.length],
      daily_data,
    };
  });

  /* ---------------------------
     FINAL RESPONSE
  ----------------------------*/
  return res.json({
    status: 1,
    code: 200,
    data: {
      student: students[0],  // 3: Important! We return the student details here
      activities_analytics,
    },
  });
});

export const downloadUserReport = asyncHandler(async (req, res) => {
  const { user_id, format } = req.query;

  if (!user_id) {
    return res.json({
      status: 0,
      message: ["user_id is required"],
    });
  }

  const [rows] = await db.execute(
    `SELECT 
        fa.name AS activity_name,
        dr.value,
        fa.unit,
        DATE(dr.activity_date) AS activity_date
     FROM daily_report dr
     JOIN fix_activities fa 
        ON fa.activity_id = dr.activity_id
     WHERE dr.user_id = ?
     ORDER BY dr.activity_date DESC`,
    [user_id]
  );

  if (!rows.length) {
    return res.json({
      status: 0,
      message: ["No report found"],
    });
  }

  /* ---------------- CSV ---------------- */

  if (format === "csv") {
    const fields = ["activity_name", "value", "unit", "activity_date"];
    const parser = new Parser({ fields });

    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment(`activity_report_${user_id}.csv`);

    return res.send(csv);
  }

  /* ---------------- XLSX ---------------- */

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Activity Report");

    worksheet.columns = [
      { header: "Activity", key: "activity_name", width: 25 },
      { header: "Value", key: "value", width: 10 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Date", key: "activity_date", width: 15 },
    ];

    rows.forEach((row) => worksheet.addRow(row));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=activity_report_${user_id}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  }
});

export const addRewardRules = asyncHandler(async (req, resp) => {
  const {
    user_id,
    reward_name,
    activity_id,
    target_value,
    target_time,
    required_days
  } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {

    user_id: ["required"],
    reward_name: ["required"],
    activity_id: ["required"],
    required_days: ["required"]
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors
    });
  }
  const [existingRule] = await db.execute(
    `SELECT reward_id 
     FROM reward_rules 
     WHERE counsller_id = ? AND activity_id = ?`,
    [user_id, activity_id]
  );

  if (existingRule.length > 0) {
    return resp.json({
      status: 0,
      code: 409,
      message: ["Rule already exists for this activity"]
    });
  }

  const insert_data = await insertRecord(
    "reward_rules",
    [

      "counsller_id",
      "reward_name",
      "activity_id",
      "target_value",
      // "target_time",
      "required_days"
    ],
    [

      user_id,
      reward_name,
      activity_id,
      target_value || null,
      // target_time || null,
      required_days
    ]
  );

  if (insert_data) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["Reward rule added successfully!"]
    });
  }
});

export const editRewardRules = asyncHandler(async (req, resp) => {
  const {
    rule_id,
    reward_name,
    target_value,
    required_days
  } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {
    rule_id: ["required"],
    reward_name: ["required"],
    required_days: ["required"]
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  const update_data = await updateRecord(
    "reward_rules",
    [
      "reward_name",
      "target_value",
      "required_days"
    ],
    [
      reward_name,
      target_value || null,
      required_days
    ],
    "id",
    rule_id
  );

  if (update_data) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["Reward rule updated successfully!"]
    });
  }
});


export const CustomNotification = asyncHandler(async (req, res) => {

  const { student_id, heading = '', description, user_id } = req.body;
  // const created_by = req.user?.user_id 
  console.log(req.body)

  const { isValid, errors } = validateFields(mergeParam(req), {
    student_id: ["required"],
    // heading: ["required"],
    description: ["required"],
    user_id: ["required"]
  });

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors
    });
  }
  const href = "cusotm_notification"
  console.log(heading,
    description,
    "custom_notification",
    "student",
    "admin",
    user_id,
    student_id,
    href || null);
  const result = await insertRecord(
    "notifications",
    [
      "heading",
      "description",
      "module_name",
      "panel_to",
      "panel_from",
      "created_by",
      "receive_id",
      "href"
    ],
    [
      heading,
      description,
      "custom_notification",
      "student",
      "admin",
      user_id,
      student_id,
      href || null
    ]
  );

  return res.json({
    success: true,
    message: "Notification sent successfully",
    data: result
  });

});

export const consllorNotificationList = asyncHandler(async (req, resp) => {
  const { page_no, getCount } = mergeParam(req);
  const { isValid, errors } = validateFields(mergeParam(req), { page_no: ["required"], });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const limit = 10;
  const start = parseInt((page_no * limit) - limit, 10);

  const totalRows = await queryDB(`SELECT COUNT(*) AS total FROM notifications WHERE panel_to = ? and status = '0' `, ['counsellor']);
  if (getCount) {

    return resp.json({
      status: 1,
      code: 200,
      message: ["Notification Count Only"],
      data: [],
      total_page: 0,
      totalRows: totalRows.total
    });
  }
  const total_page = Math.ceil(totalRows.total / limit) || 1;
  const [rows] = await db.execute(`SELECT id, heading, description, module_name, panel_to, panel_from, receive_id, status, ${formatDateTimeInQuery(['created_at'])}, href
        FROM notifications WHERE  and panel_to = 'counsellor' ORDER BY id DESC LIMIT ${start}, ${parseInt(limit)} 
    `, []);

  const notifications = rows;  // and status = 0 
  await db.execute(`UPDATE notifications SET status=? WHERE status=? AND panel_to=?`, ['1', '0', 'counsellor']);

  return resp.json({
    status: 1,
    code: 200,
    message: ["Notification list fetch successfully"],
    data: notifications,
    total_page: total_page,
    totalRows: totalRows.total
  });
});


export const addNote = asyncHandler(async (req, res) => {

  try {
    const { user_id, student_id, note_text, meeting_date } = req.body;



    const [result] = await db.execute(
      `INSERT INTO notes (counsellor_id, student_id, note_text,meeting_date)
     VALUES (?, ?, ?,?)`,
      [user_id, student_id, note_text, meeting_date]
    );

    res.status(201).json({
      success: true,
      message: "Note added successfully",
      note_id: result.insertId
    });
  } catch (error) {
    console.error("Error adding note:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding note"
    });
  }
});


export const oldeditNote = asyncHandler(async (req, res) => {

  try {

    const { note_id, user_id, note_text, meeting_date } = req.body;

    if (!note_id) {
      return res.status(400).json({
        success: false,
        message: "note_id is required"
      });
    }
    let fields = [];
    let values = [];

    if (note_text !== undefined) {
      fields.push("note_text = ?");
      values.push(note_text);
    }

    if (meeting_date !== undefined) {
      fields.push("meeting_date = ?");
      values.push(meeting_date);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    values.push(note_id);
    values.push(user_id);

    const query = `
      UPDATE notes
      SET ${fields.join(", ")}
      WHERE id = ? and counsellor_id = ?
    `;

    const [result] = await db.execute(query, values);

    if (result.affectedRows === 0) {
      return res.status(403).json({
        success: false,
        message: "Note not found or you are not allowed to edit it"
      });
    }
    res.json({
      success: true,
      message: "Note updated successfully"
    });

  } catch (error) {
    console.error("Error updating note:", error);

    res.status(500).json({
      success: false,
      message: "Server error while updating note"
    });
  }

});
export const editNote = asyncHandler(async (req, res) => {
  try {
    const { note_id, user_id, note_text, meeting_date } = req.body;

    const { isValid, errors } = validateFields(req.body, {
      note_id: ["required"],
      user_id: ["required"], // We use user_id to ensure a counsellor only edits THEIR notes
    });

    if (!isValid) return res.json({ status: 0, code: 422, message: errors });

    const [result] = await db.execute(
      `UPDATE notes SET note_text = ?, meeting_date = ? 
       WHERE id = ? AND counsellor_id = ?`,
      [note_text, meeting_date, note_id, user_id]
    );

    res.status(200).json({
      status: 1, // Status 1 signals success to your frontend logic
      success: true,
      message: "Note updated successfully",
    });
  } catch (error) {
    console.error("Error editing note:", error);
    res.status(500).json({
      status: 0,
      success: false,
      message: "Server error while editing note"
    });
  }
});



export const deleteNote = asyncHandler(async (req, res) => {

  try {

    const { note_id, user_id } = req.body;   // user_id = logged in counsellor

    if (!note_id) {
      return res.status(400).json({
        success: false,
        message: "note_id is required"
      });
    }

    const [result] = await db.execute(
      `DELETE FROM notes 
       WHERE id = ? AND counsellor_id = ?`,
      [note_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this note"
      });
    }

    res.json({
      success: true,
      message: "Note deleted successfully"
    });

  } catch (error) {

    console.error("Error deleting note:", error);

    res.status(500).json({
      success: false,
      message: "Server error while deleting note"
    });

  }

});

export const oldddContent = asyncHandler(async (req, resp) => {

  try {

    const request = req.body;

    const {
      counsellor_id,
      content_type,               // text | image | youtube
      content,            // text or URL
      group_ids = [],
      label_ids = []
    } = request;

    // ✅ Validation
    const { isValid, errors } = validateFields(request, {
      counsellor_id: ["required"],
      content_type: ["required"],
      content: ["required"]
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors
      });
    }

    // ✅ Insert content
    const contentInsert = await insertRecord(
      "contents",
      ["counsellor_id", "content_type", "content"],
      [counsellor_id, content_type, content]
    );

    const content_id = contentInsert.insertId;

    // ✅ Map groups
    if (Array.isArray(group_ids) && group_ids.length > 0) {
      const groupValues = group_ids.map(group_id => [content_id, group_id]);

      await db.query(
        `INSERT INTO content_groups (content_id, group_id) VALUES ?`,
        [groupValues]
      );
    }

    // ✅ Map labels
    if (Array.isArray(label_ids) && label_ids.length > 0) {
      const labelValues = label_ids.map(label_id => [content_id, label_id]);

      await db.query(
        `INSERT INTO content_labels (content_id, label_id) VALUES ?`,
        [labelValues]
      );
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Content added successfully"],
      data: {
        content_id
      }
    });

  } catch (err) {

    console.log("addContent error:", err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});
export const newaddContent = asyncHandler(async (req, resp) => {

  try {
    // 1. Extract Body and File (req.file comes from multer middleware)
    const request = req.body;
    const file = req.file;

    let {
      counsellor_id,
      content_type,               // text | image | youtube | url
      content,                    // text or URL from body
      group_ids = [],
      label_ids = []
    } = request;

    // 2. Parse JSON strings (FormData sends arrays as strings)
    try {
      if (typeof group_ids === 'string') group_ids = JSON.parse(group_ids);
      if (typeof label_ids === 'string') label_ids = JSON.parse(label_ids);
    } catch (e) {
      group_ids = Array.isArray(group_ids) ? group_ids : [];
      label_ids = Array.isArray(label_ids) ? label_ids : [];
    }

    // 3. Handle Image Logic
    // If it's an image, the 'content' field should be the relative path or filename
    if (content_type === 'image' && file) {
      content = `/content/${file.filename}`; // This matches your public/content requirement
    }

    // ✅ Validation
    const { isValid, errors } = validateFields({ ...request, content }, {
      counsellor_id: ["required"],
      content_type: ["required"],
      content: ["required"] // This will now be the filename for images
    });

    if (!isValid) {
      return resp.json({
        status: 0,
        code: 422,
        message: errors
      });
    }

    // ✅ Insert into contents table
    const contentInsert = await insertRecord(
      "contents",
      ["counsellor_id", "content_type", "content"],
      [counsellor_id, content_type, content]
    );

    const content_id = contentInsert.insertId;

    // ✅ Map groups
    if (Array.isArray(group_ids) && group_ids.length > 0) {
      const groupValues = group_ids.map(group_id => [content_id, group_id]);

      await db.query(
        `INSERT INTO content_groups (content_id, group_id) VALUES ?`,
        [groupValues]
      );
    }

    // ✅ Map labels
    if (Array.isArray(label_ids) && label_ids.length > 0) {
      const labelValues = label_ids.map(label_id => [content_id, label_id]);

      await db.query(
        `INSERT INTO content_labels (content_id, label_id) VALUES ?`,
        [labelValues]
      );
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Content added successfully"],
      data: {
        content_id,
        path: content // Return the saved path for verification
      }
    });

  } catch (err) {
    console.log("addContent error:", err);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });
  }
});
export const daddContent = asyncHandler(async (req, resp) => {

  const request = req.body;
  console.log("addContent request body", request);
  let {
    counsellor_id,
    content_type,
    content,
    image,
    group_ids = [],
    label_ids = []
  } = request;

  // ✅ Parse JSON strings (FormData sends arrays as strings)
  try {
    if (typeof group_ids === 'string') group_ids = JSON.parse(group_ids);
    if (typeof label_ids === 'string') label_ids = JSON.parse(label_ids);
  } catch (e) {
    group_ids = Array.isArray(group_ids) ? group_ids : [];
    label_ids = Array.isArray(label_ids) ? label_ids : [];
  }

  // ✅ Validate content_type early
  const ALLOWED_CONTENT_TYPES = ['text', 'image', 'youtube', 'url'];
  if (!ALLOWED_CONTENT_TYPES.includes(content_type)) {
    return resp.json({
      status: 0,
      code: 422,
      message: { content_type: `content_type must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` }
    });
  }

  // ✅ Handle image upload only when needed
  if (content_type === 'image') {

    let uploadedFiles;

    try {
      uploadedFiles = await uploadFiles(req, resp, 'image', ['image']);
    } catch (uploadErr) {
      return resp.status(422).json({
        status: 0,
        code: 422,
        message: { [uploadErr.field]: uploadErr.message }
      });
    }

    const imageFile = uploadedFiles?.['image']?.[0];

    if (!imageFile) {
      return resp.json({
        status: 0,
        code: 422,
        message: { image: 'Image file is required when content_type is image' }
      });
    }

    content = imageFile.file_url; // ✅ /uploads/content/filename.jpg
  }

  // ✅ Validate required fields
  const { isValid, errors } = validateFields({ ...request, content }, {
    counsellor_id: ["required"],
    content_type: ["required"],
    content: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  // ✅ Insert content
  const contentInsert = await insertRecord(
    "contents",
    ["counsellor_id", "content_type", "content"],
    [counsellor_id, content_type, content]
  );

  const content_id = contentInsert.insertId;

  // ✅ Map groups
  if (group_ids.length > 0) {
    await db.query(
      `INSERT INTO content_groups (content_id, group_id) VALUES ?`,
      [group_ids.map(group_id => [content_id, group_id])]
    );
  }

  // ✅ Map labels
  if (label_ids.length > 0) {
    await db.query(
      `INSERT INTO content_labels (content_id, label_id) VALUES ?`,
      [label_ids.map(label_id => [content_id, label_id])]
    );
  }

  return resp.json({
    status: 1,
    code: 200,
    message: ["Content added successfully"],
    data: { content_id, content }
  });

});
export const oldaddContent = asyncHandler(async (req, resp) => {
  // 1. Move file upload to the very TOP
  // We send 'public/content' as the directory name to match your requirement
  let uploadedFiles;
  try {
    // We use 'content' as dirName to save in public/content
    uploadedFiles = await uploadFiles(req, resp, 'content', ['image']);
  } catch (uploadErr) {
    return resp.status(422).json({
      status: 0,
      code: 422,
      message: { [uploadErr.field]: uploadErr.message }
    });
  }

  // 2. NOW req.body is populated because uploadFiles (Multer) has finished
  const request = req.body;
  let {
    counsellor_id,
    content_type,
    content,
    group_ids = [],
    label_ids = []
  } = request;
  console.log("addContent request body", request);
  // 3. Parse JSON arrays from FormData
  try {
    if (typeof group_ids === 'string') group_ids = JSON.parse(group_ids);
    if (typeof label_ids === 'string') label_ids = JSON.parse(label_ids);
  } catch (e) {
    group_ids = Array.isArray(group_ids) ? group_ids : [];
    label_ids = Array.isArray(label_ids) ? label_ids : [];
  }

  // 4. Handle Content Assignment for Images
  if (content_type === 'image') {
    // Access req.files directly instead of uploadedFiles
    const imageFile = req.files?.['image']?.[0];

    if (!imageFile) {
      return resp.json({
        status: 0,
        code: 422,
        message: { image: 'Image file is required when content_type is image' }
      });
    }
    // Save the file path to the content column
    content = imageFile.file_url;
  }


  // 5. Validation (with the newly populated content/body)
  const { isValid, errors } = validateFields({ ...request, content }, {
    counsellor_id: ["required"],
    content_type: ["required"],
    content: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  // 6. Database Insertion
  const contentInsert = await insertRecord(
    "contents",
    ["counsellor_id", "content_type", "content"],
    [counsellor_id, content_type, content]
  );

  const content_id = contentInsert.insertId;

  // Map groups
  if (group_ids.length > 0) {
    await db.query(`INSERT INTO content_groups (content_id, group_id) VALUES ?`, [group_ids.map(gid => [content_id, gid])]);
  }

  // Map labels
  if (label_ids.length > 0) {
    await db.query(`INSERT INTO content_labels (content_id, label_id) VALUES ?`, [label_ids.map(lid => [content_id, lid])]);
  }

  return resp.json({
    status: 1,
    code: 200,
    message: ["Content published successfully"],
    data: { content_id, content }
  });
});
export const addContent = asyncHandler(async (req, resp) => {

  // 1. req.body is ALREADY populated by the handleFileUpload middleware
  const request = req.body;
  let {
    counsellor_id,
    content_type,
    content,
    group_ids = [],
    label_ids = []
  } = request;

  // 2. Parse JSON arrays from FormData
  try {
    if (typeof group_ids === 'string') group_ids = JSON.parse(group_ids);
    if (typeof label_ids === 'string') label_ids = JSON.parse(label_ids);
  } catch (e) {
    group_ids = Array.isArray(group_ids) ? group_ids : [];
    label_ids = Array.isArray(label_ids) ? label_ids : [];
  }

  // 3. Get Image URL from req.files (populated by middleware)
  if (content_type === 'image') {
    // Access req.files directly instead of uploadedFiles
    const imageFile = req.files?.['image']?.[0];

    if (!imageFile) {
      return resp.json({
        status: 0,
        code: 422,
        message: { image: 'Image file is required when content_type is image' }
      });
    }
    // Save the file path to the content column
    // content = imageFile.file_url;
    content = imageFile.filename;
  }

  // 4. Validation 
  const { isValid, errors } = validateFields({ ...request, content }, {
    counsellor_id: ["required"],
    content_type: ["required"],
    content: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  // 5. Database Insertion
  const contentInsert = await insertRecord(
    "contents",
    ["counsellor_id", "content_type", "content"],
    [counsellor_id, content_type, content]
  );

  const content_id = contentInsert.insertId;

  // Map groups
  if (group_ids.length > 0) {
    await db.query(`INSERT INTO content_groups (content_id, group_id) VALUES ?`, [group_ids.map(gid => [content_id, gid])]);
  }

  // Map labels
  if (label_ids.length > 0) {
    await db.query(`INSERT INTO content_labels (content_id, label_id) VALUES ?`, [label_ids.map(lid => [content_id, lid])]);
  }

  return resp.json({
    status: 1,
    code: 200,
    message: ["Content published successfully"],
    data: { content_id, content }
  });
});

export const updateReportSettings = async (req, res) => {
  try {
    const { user_id, auto_report_status, report_frequency_days, report_group_id, report_subgroup_id, report_custom_days } = req.body;
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is thoroughly required."
      });
    }
    // Sanitize inputs
    const statusValue = auto_report_status !== undefined ? Number(auto_report_status) : null;
    const frequencyValue = report_frequency_days !== undefined ? Number(report_frequency_days) : null;
    const groupIdValue = report_group_id !== undefined ? (report_group_id === 'all' ? 0 : Number(report_group_id)) : null;
    const subgroupIdValue = report_subgroup_id !== undefined ? (report_subgroup_id === 'all' ? 0 : Number(report_subgroup_id)) : null;
    const customDaysValue = report_custom_days !== undefined ? Number(report_custom_days) : null;
    
    // Perform a safe update using IFNULL. 
    const [result] = await db.execute(`
            UPDATE users 
            SET 
                auto_report_status = IFNULL(?, auto_report_status), 
                report_frequency_days = IFNULL(?, report_frequency_days),
                report_group_id = IFNULL(?, report_group_id),
                report_subgroup_id = IFNULL(?, report_subgroup_id),
                report_custom_days = IFNULL(?, report_custom_days)
            WHERE user_id = ?
        `, [statusValue, frequencyValue, groupIdValue, subgroupIdValue, customDaysValue, user_id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Counsellor not found or no changes were made."
      });
    }
    return res.status(200).json({
      status: 1, // Optional: Added to match your React frontend response patterns
      success: true,
      message: "Report settings updated successfully."
    });
  } catch (error) {
    console.error("Error updating report settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update report settings."
    });
  }
};

export const oldcontentListCounsellor = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id, // Counsellor ID
      center_id,
      label_id,
      content_type
    } = mergeParam(req);

    // Filter by the counsellor who published it
    let whereConditions = `c.counsellor_id = ?`;
    let paramsArr = [user_id];

    // If a specific Group is selected in the Library dropdown
    if (center_id && center_id !== 'All') {
      whereConditions += ` AND EXISTS (SELECT 1 FROM content_groups cg WHERE cg.content_id = c.id AND cg.group_id = ?)`;
      paramsArr.push(center_id);
    }

    // If a specific Label is selected in the Library dropdown
    if (label_id && label_id !== 'All') {
      whereConditions += ` AND EXISTS (SELECT 1 FROM content_labels cl WHERE cl.content_id = c.id AND cl.label_id = ?)`;
      paramsArr.push(label_id);
    }
    if (content_type && content_type !== 'All' && content_type !== '') {
      whereConditions += ` AND c.content_type = ?`;
      paramsArr.push(content_type);
    }


    const limit = 10;
    const offset = (parseInt(page_no) - 1) * limit;
    const query = `SELECT c.id, c.content_type, c.content, c.created_at 
        FROM contents c 
        WHERE ${whereConditions} 
        ORDER BY c.created_at DESC 
        LIMIT ? OFFSET ?`;
    console.log("query,[...paramsArr, limit, offset]", query, [...paramsArr, limit, offset])
    const [data] = await db.execute(query, [...paramsArr, limit, offset]);


    return resp.json({
      status: 1,
      code: 200,
      data
    });

  } catch (error) {
    console.error("=== contentListCounsellor ERROR ===");
    console.error("Message:", error.message);
    console.error("SQL:", error.sql);
    console.error("Stack:", error.stack);
    return resp.status(500).json({ status: 0, message: "Error fetching list", error: error.message });
  }
});
export const contentListCounsellor = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      center_id,
      label_id,
      content_type
    } = mergeParam(req);

    const counsellorId = String(user_id || '').trim();
    if (!counsellorId) {
      return resp.status(400).json({ status: 0, message: "Invalid user_id" });
    }

    let whereConditions = `c.counsellor_id = ?`;
    let paramsArr = [counsellorId]; // Start with the counsellor ID

    if (center_id && center_id !== 'All') {
      whereConditions += ` AND EXISTS (SELECT 1 FROM content_groups cg WHERE cg.content_id = c.id AND cg.group_id = ?)`;
      paramsArr.push(center_id);
    }

    if (label_id && label_id !== 'All') {
      whereConditions += ` AND EXISTS (SELECT 1 FROM content_labels cl WHERE cl.content_id = c.id AND cl.label_id = ?)`;
      paramsArr.push(label_id);
    }

    if (content_type && content_type !== 'All' && content_type !== '') {
      whereConditions += ` AND c.content_type = ?`;
      paramsArr.push(content_type);
    }

    const limit = 10;
    const page = Number.isInteger(Number(page_no)) && Number(page_no) > 0 ? Number(page_no) : 1;
    const offset = (page - 1) * limit;

    // 🚨 FIX 1: Inject LIMIT and OFFSET directly into the string as numbers.
    // Do NOT use ? for LIMIT and OFFSET, this fixes the server error!
    const query = `
        SELECT c.id, c.content_type, c.content, c.created_at 
        FROM contents c 
        WHERE ${whereConditions} 
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;

    // 🚨 FIX 2: Only pass paramsArr (which holds user_id, center_id, etc.)
    console.log("QUERY:", query);
    console.log("PARAMS:", paramsArr);

    const [data] = await db.execute(query, paramsArr);

    return resp.json({
      status: 1,
      code: 200,
      data
    });

  } catch (error) {
    console.error("=== contentListCounsellor ERROR ===");
    console.error(error);
    return resp.status(500).json({ status: 0, message: "Error fetching list", error: error.message });
  }
});


export const studentNotesList = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,     // Counsellor ID
      student_id,  // Mentee ID
      rowSelected
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      user_id: ["required"],
      student_id: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const params = {
      tableName: "notes n",
      columns: "n.id as note_id, n.counsellor_id as user_id, n.student_id, n.note_text, n.meeting_date, n.created_at",
      // No join needed since we just need the notes directly
      sortColumn: "n.meeting_date",
      sortOrder: "DESC",
      page_no,
      limit: rowSelected || 100, // Keep limit high if you aren't doing strict UI pagination
      whereField: ["n.counsellor_id", "n.student_id"],
      whereValue: [user_id, student_id],
      whereOperator: ["=", "="],
    };

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Notes list fetched successfully!"],
      data: result.data,
      total_page: result.totalPage,
      total: result.total,
    });
  } catch (error) {
    console.error("Error fetching notes List:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching notes List",
    });
  }
});

export const studentAnalysisPreview = asyncHandler(async (req, res) => { res.json({ status: 1 }); });
export const generateAIAnalysis = asyncHandler(async (req, res) => {
  const { student_ids, rangeType, dateFrom, dateTo } = req.body;
  const requestedBy = req.user?.user_id;

  if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ status: 0, message: "student_ids array is required" });
  }

  // Resolve date range
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const toDate = dateTo || yesterday.toISOString().split('T')[0];

  let fromDate = dateFrom;
  if (!fromDate || rangeType !== 'CUSTOM') {
    const from = new Date(yesterday);
    if (rangeType === 'LAST_2_DAYS')  from.setDate(yesterday.getDate() - 1);
    else if (rangeType === 'LAST_7_DAYS')  from.setDate(yesterday.getDate() - 6);
    else if (rangeType === 'LAST_30_DAYS') from.setDate(yesterday.getDate() - 29);
    else if (rangeType === 'LAST_90_DAYS') from.setDate(yesterday.getDate() - 89);
    fromDate = from.toISOString().split('T')[0];
  }

  // Gather KPIs for each student
  let allStudentsData = [];
  for (const studentId of student_ids) {
    const [[userRow]] = await db.execute(`SELECT name FROM users WHERE user_id = ?`, [studentId]);
    const studentName = userRow?.name || "Unknown Student";

    const [reportRows] = await db.execute(
      `SELECT dr.*, fa.name as activity_name, fa.target
       FROM daily_report dr
       LEFT JOIN fix_activities fa ON dr.activity_id = fa.activity_id
       WHERE dr.user_id = ? AND dr.activity_date BETWEEN ? AND ?`,
      [studentId, fromDate, toDate]
    );

    const kpis = generateStudentKPIs(reportRows, fromDate, toDate);
    allStudentsData.push({ studentId, name: studentName, kpis });
  }

  // Call Groq AI (generateStudentInsights is statically imported at top of file)
  const aiAnalysis = await generateStudentInsights({ currentKpis: allStudentsData });

  // Save report (for each student in the list)
  for (const { studentId, kpis } of allStudentsData) {
    try {
      await db.execute(
        `INSERT INTO student_ai_reports (student_id, requested_by, range_type, date_from, date_to, kpis_json, overall_status, strengths_json, laggings_json, recommendations_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          studentId,
          requestedBy,
          rangeType || 'CUSTOM',
          fromDate,
          toDate,
          JSON.stringify(kpis),
          aiAnalysis.overallStatus || '',
          JSON.stringify(aiAnalysis.strengths || []),
          JSON.stringify(aiAnalysis.laggings || []),
          JSON.stringify(aiAnalysis.recommendations || [])
        ]
      );
    } catch (saveErr) {
      console.warn(`[AI] Could not save report for student ${studentId}:`, saveErr.message);
    }
  }

  return res.json({
    status: 1,
    data: {
      kpis: allStudentsData.map(s => s.kpis),
      aiAnalysis
    }
  });
});

export const oldgetStudentAiAnalysisHistory = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const requestedBy = req.user?.user_id;

  if (!studentId) return res.status(400).json({ status: 0, message: "studentId is required" });

  try {
    const [rows] = await db.execute(
      `SELECT id, range_type, date_from, date_to, overall_status, created_at
       FROM student_ai_reports
       WHERE student_id = ? AND requested_by = ?
       ORDER BY created_at DESC LIMIT 20`,
      [studentId, requestedBy]
    );
    return res.json({ status: 1, data: rows });
  } catch (err) {
    console.warn("[AI History] Table may not exist:", err.message);
    return res.json({ status: 1, data: [] });
  }
});

export const oldgetSingleAiAnalysisReport = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const requestedBy = req.user?.user_id;

  if (!reportId) return res.status(400).json({ status: 0, message: "reportId is required" });

  try {
    const [[row]] = await db.execute(
      `SELECT * FROM student_ai_reports WHERE id = ? AND requested_by = ?`,
      [reportId, requestedBy]
    );
    if (!row) return res.status(404).json({ status: 0, message: "Report not found" });

    return res.json({
      status: 1,
      data: {
        kpis: JSON.parse(row.kpis_json || '[]'),
        aiAnalysis: {
          overallStatus: row.overall_status,
          strengths: JSON.parse(row.strengths_json || '[]'),
          laggings: JSON.parse(row.laggings_json || '[]'),
          recommendations: JSON.parse(row.recommendations_json || '[]')
        }
      }
    });
  } catch (err) {
    console.warn("[AI Report] Error fetching report:", err.message);
    return res.status(500).json({ status: 0, message: "Failed to fetch report" });
  }
});


export const getStudentAiAnalysisHistory = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const requestedBy = req.user?.user_id;

  if (!studentId) return res.status(400).json({ status: 0, message: "studentId is required" });

  try {
    const [rows] = await db.execute(
      `SELECT id, range_type, date_from, date_to, overall_status, created_at
       FROM student_ai_reports
       WHERE student_id = ? AND requested_by = ?
       ORDER BY created_at DESC LIMIT 20`,
      [studentId, requestedBy]
    );
    return res.json({ status: 1, data: rows });
  } catch (err) {
    console.warn("[AI History] Table may not exist:", err.message);
    return res.json({ status: 1, data: [] });
  }
});

export const getSingleAiAnalysisReport = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const requestedBy = req.user?.user_id;

  if (!reportId) return res.status(400).json({ status: 0, message: "reportId is required" });

  try {
    const [[row]] = await db.execute(
      `SELECT * FROM student_ai_reports WHERE id = ? AND requested_by = ?`,
      [reportId, requestedBy]
    );
    if (!row) return res.status(404).json({ status: 0, message: "Report not found" });

    return res.json({
      status: 1,
      data: {
        kpis: JSON.parse(row.kpis_json || '[]'),
        aiAnalysis: {
          overallStatus: row.overall_status,
          strengths: JSON.parse(row.strengths_json || '[]'),
          laggings: JSON.parse(row.laggings_json || '[]'),
          recommendations: JSON.parse(row.recommendations_json || '[]')
        }
      }
    });
  } catch (err) {
    console.warn("[AI Report] Error fetching report:", err.message);
    return res.status(500).json({ status: 0, message: "Failed to fetch report" });
  }
});
export const aiChatHandler = asyncHandler(async (req, res) => {
  try {
    console.log("=== AI ANALYSIS STARTED ===");
    console.log("1. Request Received");
    console.log("2. User Authenticated");

    const { studentIds, fromDate, toDate, messages } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ errorType: "VALIDATION_ERROR", message: "studentIds array is required" });
    }

    let allStudentsData = [];
    for (const studentId of studentIds) {
      const [userRows] = await db.execute(`SELECT name FROM users WHERE user_id = ?`, [studentId]);
      const studentName = userRows[0]?.name || "Unknown Student";

      const [reportRows] = await db.execute(
        `SELECT dr.*, fa.name as activity_name, fa.target
                 FROM daily_report dr
                 LEFT JOIN fix_activities fa ON dr.activity_id = fa.activity_id
                 WHERE dr.user_id = ? AND dr.activity_date BETWEEN ? AND ?`,
        [studentId, fromDate, toDate]
      );

      const kpis = generateStudentKPIs(reportRows, fromDate, toDate);
      allStudentsData.push({ studentId, name: studentName, kpis });
    }

    console.log("3. KPI Data Prepared");

    const systemPrompt = `You are an AI Mentor for Sadhana. You are analyzing the following students' performance data:
${JSON.stringify(allStudentsData, null, 2)}
Provide concise, conversational, and actionable insights. Use markdown. Do not output raw JSON.`;

    console.log("4. Groq Request Started");
    const aiResponse = await chatWithAI({ systemPrompt, messages });
    console.log("5. Groq Response Received");
    res.status(200).json({ status: 1, success: true, reply: aiResponse });
  } catch (error) {
    console.error("=== AI ERROR ===");
    console.error(error);
    console.error(error.message);
    console.error(error.stack);

    res.status(500).json({
      errorType: error.errorType || "SERVER_ERROR",
      message: error.message || "Failed to process AI chat",
      details: error.stack
    });
  }
});

export const aiHealthHandler = asyncHandler(async (req, res) => { res.json({ status: 1 }); });
export const aiTestHandler = asyncHandler(async (req, res) => { res.json({ status: 1 }); });
export const aiDebugAuthHandler = asyncHandler(async (req, res) => { res.json({ status: 1 }); });

export const exportBulkStudentReports = asyncHandler(async (req, resp) => {
  try {
    const { user_id, center_id, label_id, filter = '7', start_date, end_date, student_ids } = mergeParam(req);

    // FIX (counsellor-scoping leak): this endpoint previously never scoped
    // results to the requesting counsellor at all, so it returned every
    // student/group/subgroup across EVERY counsellor's account. Mirrors the
    // proven scoping pattern from studentlist() above: require the
    // requesting counsellor's user_id and only include students who have a
    // user_counsellors row for that counsellor. If user_id is missing,
    // fail safe (return no data) rather than leaking every account's data.
    if (!user_id) {
      return resp.json({
        status: 1,
        code: 200,
        message: ["Export data fetched successfully"],
        data: []
      });
    }

    let dateCondition = "";
    const params = [];

    if (start_date && end_date && filter !== 'all') {
      dateCondition = "AND DATE(dr.activity_date) >= ? AND DATE(dr.activity_date) <= ?";
      params.push(start_date, end_date);
    } else if (filter !== 'all') {
      const days = parseInt(filter) || 7;
      dateCondition = "AND DATE(dr.activity_date) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)";
      params.push(days);
    }

    // Counsellor-scoping param, inserted into the WHERE clause immediately
    // after the fixed 'u.user_type != counsellor' condition (see query
    // below) — pushed here so params[] stays in the same left-to-right
    // order as the placeholders appear in the final query string.
    params.push(user_id);

    let centerCondition = "";
    if (center_id === 'ungrouped') {
      // Students of this counsellor who are not in any group
      centerCondition = "AND (ua.center_id IS NULL OR ua.center_id = 0)";
    } else if (center_id && center_id !== 'all' && center_id !== '0' && center_id !== '') {
      centerCondition = "AND ua.center_id = ?";
      params.push(center_id);
    }

    let labelCondition = "";
    if (label_id && label_id !== '0' && label_id !== 'All' && label_id !== '') {
      labelCondition = "AND ua.label_id = ?";
      params.push(label_id);
    }

    let studentCondition = "";
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      studentCondition = `AND u.user_id IN (${student_ids.map(() => '?').join(',')})`;
      params.push(...student_ids);
    }

    const query = `
      SELECT
        u.user_id AS student_id,
        u.name AS student_name,
        u.mobile,
        COALESCE(cl.name, 'Unassigned Group') AS center_name,
        COALESCE(l.name, 'Uncategorized') AS label_name,
        COALESCE(fa.name, CASE WHEN dr.id IS NOT NULL THEN 'Activity' ELSE 'No Logged Activity' END) AS activity_name,
        dr.activity_id AS activity_id,
        COALESCE(dr.count, '-') AS activity_value,
        COALESCE(dr.marks, 0) AS activity_marks,
        CASE WHEN dr.id IS NOT NULL THEN
          COALESCE(
            (SELECT MAX(mr.marks) FROM marking_rules mr
              WHERE mr.master_activity_id = fa.master_activity_id
                AND mr.status = 1 AND mr.frequency = 'daily'
                AND mr.scheme_id = COALESCE(l.marking_scheme_id, cl.marking_scheme_id, 1)),
            (SELECT MAX(mr2.marks) FROM marking_rules mr2
              WHERE mr2.master_activity_id = fa.master_activity_id
                AND mr2.status = 1 AND mr2.frequency = 'daily' AND mr2.scheme_id = 1),
            0
          )
        ELSE NULL END AS activity_max_possible_marks,
        COALESCE(DATE_FORMAT(dr.activity_date, '%Y-%m-%d'), '-') AS activity_date
      FROM users u
      INNER JOIN user_counsellors uc ON uc.user_id = u.user_id
      LEFT JOIN user_assignments ua ON ua.user_id = u.user_id AND ua.counsellor_id = uc.counsller_id
      LEFT JOIN center_list cl ON cl.center_id = ua.center_id
      LEFT JOIN labels_list l ON l.id = ua.label_id
      LEFT JOIN daily_report dr ON dr.user_id = u.user_id ${dateCondition}
      LEFT JOIN fix_activities fa ON fa.activity_id = dr.activity_id
      WHERE u.user_type != 'counsellor' AND uc.counsller_id = ? ${centerCondition} ${labelCondition} ${studentCondition}
      ORDER BY cl.name, l.name, u.name, dr.activity_date DESC
    `;

    console.log("exportBulkStudentReports params:", params);
    const [rows] = await db.execute(query, params);
    console.log("exportBulkStudentReports rows count:", rows?.length);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Export data fetched successfully"],
      data: rows
    });
  } catch (error) {
    console.error("Error in exportBulkStudentReports:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Failed to fetch export report data"],
      data: []
    });
  }
});
