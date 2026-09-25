import { getPaginatedData } from "../../../utils/dbUtils.js";
import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import validateFields from "../../../utils/validation.js";
import db from "../../../config/database.js";
import crypto from "crypto";

export const getMentorSelectableActivities = asyncHandler(async (req, resp) => {
  try {
    const {
      user_id,
      page_no = 1,
      search_text = "",
      rowSelected,
      center_id = "",
      label_id = "",
      only_available = false
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const safeCenterId = db.escape(center_id);
    const safeLabelId = (label_id && label_id !== "0" && label_id !== 0) ? db.escape(label_id) : null;
    const safeUserId = db.escape(user_id);

    const params = {
      tableName: `(
        SELECT *, id AS master_activity_id,
        CASE
          WHEN activities.status = 1 THEN 1
          WHEN (SELECT COUNT(*) FROM counselor_added_activities caa WHERE caa.master_activity_id = activities.id AND caa.center_id = ${safeCenterId} ${safeLabelId ? `AND (caa.label_id = ${safeLabelId} OR caa.label_id IS NULL)` : ""}) > 0 THEN 1
          ELSE 0
        END AS assignment_status
        FROM activities 
        WHERE (counsellor_id IS NULL OR counsellor_id = ${safeUserId})
      ) AS activities`,
      columns: `master_activity_id, name, description, unit, target, activity_type, counsellor_id, status AS original_status, assignment_status AS status`,
      sortColumn: "master_activity_id",
      sortOrder: "ASC",
      page_no,
      limit: rowSelected || 15,
      liveSearchFields: ["name", "description"],
      liveSearchTexts: [search_text, search_text],
      whereField: only_available ? ["assignment_status", "status"] : ["status"],
      whereValue: only_available ? [0, 0] : [0],
      whereOperator: only_available ? ["=", "!="] : ["!="],
    };

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Activities fetched successfully!"],
      data: result.data,
      total_page: result.totalPage,
      total: result.total,
    });
  } catch (error) {
    console.error("Error fetching mentor selectable activities:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: "Error fetching mentor selectable activities",
    });
  }
});


export const assignActivitiesToStudents = asyncHandler(async (req, resp) => {
  try {
    const {
      counsellor_id,
      master_activity_ids, // Expecting an array
      user_ids, // Expecting an array
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      counsellor_id: ["required"],
      master_activity_ids: ["required"],
      user_ids: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    // Validate arrays
    let activityIds = master_activity_ids;
    let studentIds = user_ids;
    
    // Sometimes form-data sends a single item as a string instead of array, so we ensure it's an array
    if (!Array.isArray(activityIds)) activityIds = [activityIds];
    if (!Array.isArray(studentIds)) studentIds = [studentIds];

    if (activityIds.length === 0) {
      return resp.json({ status: 0, code: 422, message: ["Please select at least one activity."] });
    }

    if (studentIds.length === 0) {
      return resp.json({ status: 0, code: 422, message: ["Please select at least one student."] });
    }

    // 1. Fetch details of selected activities from the master activities table
    const placeholders = activityIds.map(() => "?").join(",");
    const activitiesQuery = `SELECT id, name, description, unit, activity_type, target FROM activities WHERE id IN (${placeholders})`;
    
    const [activities] = await db.query(activitiesQuery, activityIds);

    if (activities.length === 0) {
      return resp.json({ status: 0, code: 404, message: ["Selected activities not found."] });
    }

    // 2. Prepare bulk insert data
    const values = [];
    const flatParams = [];
    
    activities.forEach((activity) => {
      studentIds.forEach((user_id) => {
        // const activity_id = crypto.randomUUID(); // generate unique 36-char string for fix_activities
        
        values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?)");
        flatParams.push(
          activity.id, // master_activity_id
          counsellor_id,
          activity.name,
          activity.description,
          activity.unit,
          activity.activity_type,
          activity.target,
          0, // own_by = 0 (Public)
          user_id
        );
      });
    });

    // 3. Execute Bulk Insert in Chunks (MySQL has a limit on placeholders, so we chunk large inserts)
    const CHUNK_SIZE = 500; // 500 rows per chunk
    let rowsInserted = 0;

    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
      const chunkValues = values.slice(i, i + CHUNK_SIZE);
      const chunkParams = flatParams.slice(i * 9, (i + CHUNK_SIZE) * 9); // 9 columns per row

      const insertQuery = `
        INSERT INTO fix_activities 
        ( master_activity_id, counsellor_id, name, description, unit, activity_type, target, own_by, user_id) 
        VALUES ${chunkValues.join(", ")}
      `;

      const [result] = await db.query(insertQuery, chunkParams);
      rowsInserted += result.affectedRows;
    }

    // 4. Also store in counselor_added_activities
    const userPlaceholders = studentIds.map(() => "?").join(",");
    const assignmentsQuery = `SELECT user_id, center_id, label_id FROM user_assignments WHERE user_id IN (${userPlaceholders})`;
    const [userAssignments] = await db.query(assignmentsQuery, studentIds);

    const caaValues = [];
    const caaParams = [];
    const insertedCombos = new Set();

    activities.forEach((activity) => {
      userAssignments.forEach((assignment) => {
        if (assignment.center_id && assignment.label_id) {
          const comboKey = `${counsellor_id}_${assignment.center_id}_${assignment.label_id}_${activity.id}`;
          if (!insertedCombos.has(comboKey)) {
            insertedCombos.add(comboKey);
            caaValues.push("(?, ?, ?, ?)");
            caaParams.push(counsellor_id, assignment.center_id, assignment.label_id, activity.id);
          }
        }
      });
    });

    if (caaValues.length > 0) {
      // Chunking for counselor_added_activities as well to be safe
      const CAA_CHUNK_SIZE = 500;
      for (let i = 0; i < caaValues.length; i += CAA_CHUNK_SIZE) {
        const chunkValues = caaValues.slice(i, i + CAA_CHUNK_SIZE);
        const chunkParams = caaParams.slice(i * 4, (i + CAA_CHUNK_SIZE) * 4);
        
        const caaInsertQuery = `
          INSERT IGNORE INTO counselor_added_activities 
          (counselor_id, center_id, label_id, master_activity_id) 
          VALUES ${chunkValues.join(", ")}
        `;
        await db.query(caaInsertQuery, chunkParams);
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: [`Successfully assigned ${activities.length} activities to ${studentIds.length} students.`],
      data: { rowsInserted }
    });

  } catch (error) {
    console.error("Error assigning activities:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error assigning activities to students."],
    });
  }
});

export const createCustomActivity = asyncHandler(async (req, resp) => {
  try {
    const { name, activity_type, target, counsellor_id, unit } = mergeParam(req);
    
    // 1. Basic validation
    const { isValid, errors } = validateFields(mergeParam(req), {
      name: ["required"],
      activity_type: ["required"],
      counsellor_id: ["required"],
      unit: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    // Validate enum values
    const validActivityTypes = ['yes_no', 'min', 'time', 'numb'];
    const validUnits = ['min', 'rounds', 'page', 'time', 'boolean', 'hours'];

    if (!validActivityTypes.includes(activity_type)) {
      return resp.json({ status: 0, code: 422, message: ["Invalid activity type."] });
    }
    if (!validUnits.includes(unit)) {
      return resp.json({ status: 0, code: 422, message: ["Invalid unit."] });
    }

    // 3. Insert into the main activities table
    const insertQuery = `INSERT INTO activities (name, activity_type, target, unit, counsellor_id, status) VALUES (?, ?, ?, ?, ?, ?)`;
    const [result] = await db.query(insertQuery, [name, activity_type, target || 0, unit, counsellor_id, 3]);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Custom activity created successfully!"],
      data: { activity_id: result.insertId }
    });
  } catch (error) {
    console.error("Error creating custom activity:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error creating custom activity."],
    });
  }
});

export const assignActivitiesToGroup = asyncHandler(async (req, resp) => {
  try {
    const { user_id, center_id, label_id, master_activity_ids } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      user_id: ["required"],
      center_id: ["required"],
      master_activity_ids: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    let activityIds = master_activity_ids;
    if (!Array.isArray(activityIds)) activityIds = [activityIds];

    if (activityIds.length === 0) {
      return resp.json({ status: 0, code: 422, message: ["Please select at least one activity."] });
    }

    const placeholders = activityIds.map(() => "?").join(",");
    const activitiesQuery = `SELECT id, name, description, unit, activity_type, target FROM activities WHERE id IN (${placeholders})`;
    const [activities] = await db.query(activitiesQuery, activityIds);

    if (activities.length === 0) {
      return resp.json({ status: 0, code: 404, message: ["Selected activities not found."] });
    }

    // 1. Insert into counselor_added_activities
    const caaValues = [];
    const caaParams = [];
    
    // Convert label_id to null if empty or "0"
    const safeLabelId = (label_id && label_id !== "0" && label_id !== 0) ? label_id : null;

    activities.forEach((activity) => {
      caaValues.push("(?, ?, ?, ?)");
      caaParams.push(user_id, center_id, safeLabelId, activity.id);
    });

    if (caaValues.length > 0) {
      const caaInsertQuery = `
        INSERT IGNORE INTO counselor_added_activities 
        (counselor_id, center_id, label_id, master_activity_id) 
        VALUES ${caaValues.join(", ")}
      `;
      await db.query(caaInsertQuery, caaParams);
    }

    // 2. Fetch all students in this group/sub-group
    let studentsQuery = `SELECT user_id FROM user_assignments WHERE center_id = ?`;
    const studentsParams = [center_id];
    
    if (safeLabelId) {
      studentsQuery += ` AND label_id = ?`;
      studentsParams.push(safeLabelId);
    }
    
    const [students] = await db.query(studentsQuery, studentsParams);
    
    // 3. Assign activities to these students
    let rowsInserted = 0;
    if (students.length > 0) {
      const values = [];
      const flatParams = [];
      
      activities.forEach((activity) => {
        students.forEach((student) => {
          values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?)");
          flatParams.push(
            activity.id, // master_activity_id
            user_id, // counsellor_id
            activity.name,
            activity.description,
            activity.unit,
            activity.activity_type,
            activity.target,
            0, // own_by = 0 (Public)
            student.user_id
          );
        });
      });

      const CHUNK_SIZE = 500;
      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        const chunkValues = values.slice(i, i + CHUNK_SIZE);
        const chunkParams = flatParams.slice(i * 9, (i + CHUNK_SIZE) * 9);

        const insertQuery = `
          INSERT INTO fix_activities 
          (master_activity_id, counsellor_id, name, description, unit, activity_type, target, own_by, user_id) 
          VALUES ${chunkValues.join(", ")}
        `;

        const [result] = await db.query(insertQuery, chunkParams);
        rowsInserted += result.affectedRows;
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: [`Successfully assigned ${activities.length} activities to the group. (${students.length} students updated)`]
    });

  } catch (error) {
    console.error("Error assigning activities to group:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error assigning activities to group."],
    });
  }
});

export const deassignActivitiesFromGroup = asyncHandler(async (req, resp) => {
  try {
    const { center_id, label_id, master_activity_ids } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      center_id: ["required"],
      master_activity_ids: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    let activityIds = master_activity_ids;
    if (!Array.isArray(activityIds)) activityIds = [activityIds];

    if (activityIds.length === 0) {
      return resp.json({ status: 0, code: 422, message: ["Please select at least one activity to remove."] });
    }

    const safeLabelId = label_id ? label_id : null;
    const activityPlaceholders = activityIds.map(() => "?").join(",");

    // 1. Delete from counselor_added_activities
    let deleteCaaQuery = `DELETE FROM counselor_added_activities WHERE center_id = ? AND master_activity_id IN (${activityPlaceholders})`;
    let deleteCaaParams = [center_id, ...activityIds];

    if (safeLabelId) {
      deleteCaaQuery += ` AND label_id = ?`;
      deleteCaaParams.push(safeLabelId);
    } else {
      deleteCaaQuery += ` AND label_id IS NULL`;
    }

    await db.query(deleteCaaQuery, deleteCaaParams);

    // 2. Fetch all students in this group/sub-group
    let studentsQuery = `SELECT user_id FROM user_assignments WHERE center_id = ?`;
    const studentsParams = [center_id];
    
    if (safeLabelId) {
      studentsQuery += ` AND label_id = ?`;
      studentsParams.push(safeLabelId);
    }
    
    const [students] = await db.query(studentsQuery, studentsParams);

    // 3. Delete from fix_activities for these students
    let rowsDeleted = 0;
    if (students.length > 0) {
      const studentIds = students.map(s => s.user_id);
      
      // Delete in chunks if there are many students, but typically IN clauses can handle a few hundred
      const CHUNK_SIZE = 500;
      for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
        const studentChunk = studentIds.slice(i, i + CHUNK_SIZE);
        const studentPlaceholders = studentChunk.map(() => "?").join(",");
        
        const deleteFixQuery = `
          DELETE FROM fix_activities 
          WHERE master_activity_id IN (${activityPlaceholders}) 
          AND user_id IN (${studentPlaceholders})
        `;
        
        const [result] = await db.query(deleteFixQuery, [...activityIds, ...studentChunk]);
        rowsDeleted += result.affectedRows;
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: [`Successfully removed ${activityIds.length} activities from the group. (${rowsDeleted} records deleted)`]
    });

  } catch (error) {
    console.error("Error deassigning activities from group:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error removing activities from group."],
    });
  }
});

export const deleteCustomActivity = asyncHandler(async (req, resp) => {
  try {
    const { master_activity_id, user_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      master_activity_id: ["required"],
      user_id: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    // 1. Delete custom activity (status = 3) created by this counsellor
    const deleteQuery = `DELETE FROM activities WHERE id = ? AND status = 3 AND counsellor_id = ?`;
    const [result] = await db.query(deleteQuery, [master_activity_id, user_id]);

    if (result.affectedRows > 0) {
      // 2. Find all student assignments (activity_id) linked to this master activity
      const [fixRecords] = await db.query(`SELECT activity_id FROM fix_activities WHERE master_activity_id = ?`, [master_activity_id]);

      if (fixRecords.length > 0) {
        const fixIds = fixRecords.map(r => r.activity_id);
        const placeholders = fixIds.map(() => "?").join(",");
        
        // 3. Delete student score histories from daily_report first
        await db.query(`DELETE FROM daily_report WHERE activity_id IN (${placeholders})`, fixIds);
        
        // 4. Delete student assignments from fix_activities
        await db.query(`DELETE FROM fix_activities WHERE master_activity_id = ?`, [master_activity_id]);
      }

      // 5. Delete group mappings from counselor_added_activities
      await db.query(`DELETE FROM counselor_added_activities WHERE master_activity_id = ?`, [master_activity_id]);

      return resp.json({
        status: 1,
        code: 200,
        message: ["Custom activity deleted successfully from all records!"],
      });
    } else {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Custom activity not found or not eligible for deletion."],
      });
    }
  } catch (error) {
    console.error("Error deleting custom activity:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error deleting custom activity."],
    });
  }
});

export const deleteAssignedCustomActivity = asyncHandler(async (req, resp) => {
  try {
    const { center_id, label_id, master_activity_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      center_id: ["required"],
      master_activity_id: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const safeLabelId = (label_id && label_id !== "0" && label_id !== 0) ? label_id : null;

    // 1. Delete from counselor_added_activities
    let deleteCaaQuery = `DELETE FROM counselor_added_activities WHERE center_id = ? AND master_activity_id = ?`;
    let deleteCaaParams = [center_id, master_activity_id];

    if (safeLabelId) {
      deleteCaaQuery += ` AND label_id = ?`;
      deleteCaaParams.push(safeLabelId);
    } else {
      deleteCaaQuery += ` AND label_id IS NULL`;
    }
    await db.query(deleteCaaQuery, deleteCaaParams);

    // 2. Fetch all students in this group/sub-group
    let studentsQuery = `SELECT user_id FROM user_assignments WHERE center_id = ?`;
    const studentsParams = [center_id];
    
    if (safeLabelId) {
      studentsQuery += ` AND label_id = ?`;
      studentsParams.push(safeLabelId);
    }
    const [students] = await db.query(studentsQuery, studentsParams);

    if (students.length > 0) {
      const studentIds = students.map(s => s.user_id);
      const studentPlaceholders = studentIds.map(() => "?").join(",");

      // 3. Find the activity_id (primary key) in fix_activities for these students
      const selectFixQuery = `
        SELECT activity_id FROM fix_activities 
        WHERE master_activity_id = ? AND user_id IN (${studentPlaceholders})
      `;
      const [fixRecords] = await db.query(selectFixQuery, [master_activity_id, ...studentIds]);

      if (fixRecords.length > 0) {
        const fixIds = fixRecords.map(r => r.activity_id);
        const fixPlaceholders = fixIds.map(() => "?").join(",");

        // 4. Delete from daily_report
        const deleteReportQuery = `DELETE FROM daily_report WHERE activity_id IN (${fixPlaceholders})`;
        await db.query(deleteReportQuery, fixIds);

        // 5. Delete from fix_activities
        const deleteFixQuery = `DELETE FROM fix_activities WHERE activity_id IN (${fixPlaceholders})`;
        await db.query(deleteFixQuery, fixIds);
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Assigned custom activity removed successfully from all records."]
    });
  } catch (error) {
    console.error("Error deleting assigned custom activity:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error deleting assigned custom activity."]
    });
  }
});

export const getGroupSubgroupList = asyncHandler(async (req, resp) => {
  try {
    const { user_id } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      user_id: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const safeUserId = db.escape(user_id);

    // 1. Fetch all groups (centers) belonging to this counsellor
    const centersQuery = `
      SELECT cl.center_id, cl.name, cl.marking_scheme_id 
      FROM center_list cl 
      WHERE cl.counsller_id = ${safeUserId}
      ORDER BY cl.created_at DESC
    `;
    const [centers] = await db.query(centersQuery);

    if (centers.length > 0) {
      const centerIds = centers.map(c => c.center_id);
      
      // 2. Fetch all labels for these centers and counselor
      const labelsQuery = `
        SELECT id AS label_id, name AS label_name, center_id, marking_scheme_id 
        FROM labels_list 
        WHERE center_id IN (${centerIds.map(() => '?').join(',')}) AND counsellor_id = ?
        ORDER BY id DESC
      `;
      const [labels] = await db.query(labelsQuery, [...centerIds, user_id]);

      // 3. Map labels to centers
      centers.forEach(center => {
        center.labels = labels
          .filter(l => l.center_id === center.center_id)
          .map(l => ({ 
            id: l.label_id, 
            name: l.label_name,
            marking_scheme_id: l.marking_scheme_id 
          }));
      });
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Groups and subgroups fetched successfully!"],
      data: centers,
    });
  } catch (error) {
    console.error("Error fetching group and subgroup list:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error fetching group and subgroup list."],
    });
  }
});
