import { insertRecord, deleteRecord } from "../../../utils/dbUtils.js";
import { asyncHandler, mergeParam } from "../../../utils/utils.js";
import validateFields from "../../../utils/validation.js";
import db from "../../../config/database.js";

export const addMarkingRule = asyncHandler(async (req, resp) => {
  try {
    const {
      master_activity_id,
      center_id, // Still coming from frontend as center_id (legacy naming in frontend param)
      remark,
      frequency,
      condition_operator,
      condition_value,
      marks,
      counsellor_id,
      status = 1
    } = mergeParam(req);

    // Validate required fields
    const { isValid, errors } = validateFields(mergeParam(req), {
      master_activity_id: ["required"],
      center_id: ["required"],
      frequency: ["required"],
      condition_operator: ["required"],
      condition_value: ["required"],
      marks: ["required"],
      counsellor_id: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const columns = [
      "center_id",
      "master_activity_id",
      "remark",
      "frequency",
      "condition_operator",
      "condition_value",
      "marks",
      "counsellor_id",
      "status"
    ];

    const values = [
      center_id, // maps to scheme_id logically but DB uses center_id
      master_activity_id,
      remark || "",
      frequency,
      condition_operator,
      condition_value,
      marks,
      counsellor_id,
      status
    ];

    // Insert into marking_rules table
    const result = await insertRecord("marking_rules", columns, values);

    if (result.affectedRows > 0) {
      return resp.json({
        status: 1,
        code: 200,
        message: ["Marking rule added successfully!"],
        data: { insertId: result.insertId }
      });
    } else {
      return resp.json({
        status: 0,
        code: 400,
        message: ["Failed to add marking rule."],
      });
    }
  } catch (error) {
    console.error("Error adding marking rule:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error adding marking rule."],
    });
  }
});

export const saveMarkingSchemeBatch = asyncHandler(async (req, resp) => {
  try {
    const { center_id, counsellor_id, activities, name } = mergeParam(req);

    if (!counsellor_id || !Array.isArray(activities)) {
      return resp.json({ status: 0, code: 422, message: ["Missing required fields or activities must be an array"] });
    }

    let schemeIdToUse = center_id;
    let needsInsert = true;
    if (center_id && center_id < 1000000000) {
      const [existing] = await db.query("SELECT id FROM marking_schemes WHERE id = ?", [center_id]);
      if (existing && existing.length > 0) {
        needsInsert = false;
      }
    }

    if (needsInsert) {
      const [insertRes] = await db.query(
        "INSERT INTO marking_schemes (name, counsellor_id, is_enabled) VALUES (?, ?, 1)",
        [name || "Custom Scheme", counsellor_id]
      );
      schemeIdToUse = insertRes.insertId;
    } else {
      if (name) {
        await db.query("UPDATE marking_schemes SET name = ? WHERE id = ?", [name, center_id]);
      }
    }

    // Delete existing rules for this scheme id
    await deleteRecord("marking_rules", "center_id", schemeIdToUse);

    const columns = [
      "center_id",
      "master_activity_id",
      "remark",
      "frequency",
      "condition_operator",
      "condition_value",
      "marks",
      "counsellor_id",
      "status"
    ];

    let insertedCount = 0;

    for (const activity of activities) {
      let master_activity_id = activity.id;
      if (typeof master_activity_id === 'string') {
        if (master_activity_id.includes('_')) {
          master_activity_id = master_activity_id.split('_')[0];
        }
        if (master_activity_id.startsWith('def')) {
          master_activity_id = master_activity_id.replace('def', '');
        }
        master_activity_id = parseInt(master_activity_id, 10) || 1;
      }

      const frequency = activity.badge || "Daily";

      const processRows = async (rows) => {
        if (!rows) return;
        for (const row of rows) {
          const conditionStr = row.condition || "";
          let operator = "=";
          let value = conditionStr;
          
          const rulesMap = {
            "Before": "<=",
            "After": ">=",
            "Exact Time": "=",
            "At Least": ">=",
            "Up To": "<=",
            "Yes": "=",
            "No": "="
          };

          for (const [rule, op] of Object.entries(rulesMap)) {
            if (conditionStr.toLowerCase().startsWith(rule.toLowerCase())) {
              operator = op;
              value = conditionStr.substring(rule.length).trim();
              if (rule === "Yes" || rule === "No") value = rule;
              break;
            }
          }

          const values = [
            schemeIdToUse,
            master_activity_id,
            "", // remark
            frequency,
            operator,
            value,
            row.marks || 0,
            counsellor_id,
            1 // status
          ];

          await insertRecord("marking_rules", columns, values);
          insertedCount++;
        }
      };

      if (activity.subTables) {
        for (const sub of activity.subTables) {
          await processRows(sub.rows);
        }
      } else if (activity.rows) {
        await processRows(activity.rows);
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marking scheme saved successfully!"],
      data: { insertedCount, schemeId: schemeIdToUse }
    });

  } catch (error) {
    console.error("Error saving marking scheme batch:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error saving marking scheme."],
    });
  }
});

export const getMarkingRules = asyncHandler(async (req, resp) => {
  try {
    const { center_id = 0, label_id = "" } = mergeParam(req);
    const safeCenterId = db.escape(center_id);

    const query = `
      SELECT 
        mr.*, 
        a.name AS activity_name, 
        a.unit AS activity_unit, 
        a.activity_type 
      FROM marking_rules mr
      JOIN activities a ON mr.master_activity_id = a.id
      WHERE mr.center_id = ${safeCenterId} AND mr.status = 1
      ORDER BY mr.master_activity_id ASC, mr.marks DESC
    `;

    const [rows] = await db.query(query);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marking rules fetched successfully!"],
      data: rows
    });
  } catch (error) {
    console.error("Error fetching marking rules:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error fetching marking rules."]
    });
  }
});

export const getSchemesList = asyncHandler(async (req, resp) => {
  try {
    const { counsellor_id } = mergeParam(req);

    if (!counsellor_id) {
      return resp.json({ status: 0, code: 422, message: ["counsellor_id is required"] });
    }

    const query = `
      SELECT 
        ms.id,
        ms.name,
        ms.counsellor_id,
        ms.is_enabled as isEnabled,
        (ms.counsellor_id = 'system') as isSystemDefault,
        (ms.counsellor_id = 'system') as isLocked,
        (SELECT COUNT(*) FROM center_list cl 
         WHERE cl.counsller_id = ? 
           AND (
             (ms.counsellor_id = 'system' AND (
                NOT EXISTS (SELECT 1 FROM labels_list WHERE center_id = cl.center_id)
                OR EXISTS (
                  SELECT 1 FROM labels_list ll 
                  WHERE ll.center_id = cl.center_id 
                    AND (ll.marking_scheme_id IN (SELECT id FROM marking_schemes WHERE counsellor_id = 'system') OR (ll.marking_scheme_id IS NULL AND (cl.marking_scheme_id IS NULL OR cl.marking_scheme_id IN (SELECT id FROM marking_schemes WHERE counsellor_id = 'system'))))
                )
             ))
             OR
             (ms.counsellor_id != 'system' AND (
                cl.marking_scheme_id = ms.id 
                OR EXISTS (
                  SELECT 1 FROM labels_list ll 
                  WHERE ll.center_id = cl.center_id 
                    AND (ll.marking_scheme_id = ms.id OR (ll.marking_scheme_id IS NULL AND cl.marking_scheme_id = ms.id))
                )
             ))
           )
        ) as appliedGroupCount,
        (SELECT COUNT(*) FROM labels_list ll
         WHERE ll.counsellor_id = ?
           AND (
             (ms.counsellor_id = 'system' AND (
                ll.marking_scheme_id IN (SELECT id FROM marking_schemes WHERE counsellor_id = 'system')
                OR (ll.marking_scheme_id IS NULL AND EXISTS (
                   SELECT 1 FROM center_list cl WHERE cl.center_id = ll.center_id AND (cl.marking_scheme_id IS NULL OR cl.marking_scheme_id IN (SELECT id FROM marking_schemes WHERE counsellor_id = 'system'))
                ))
             ))
             OR
             (ms.counsellor_id != 'system' AND (
                ll.marking_scheme_id = ms.id 
                OR (ll.marking_scheme_id IS NULL AND EXISTS (
                   SELECT 1 FROM center_list cl WHERE cl.center_id = ll.center_id AND cl.marking_scheme_id = ms.id
                ))
             ))
           )
        ) as appliedSubgroupCount
      FROM marking_schemes ms
      WHERE ms.counsellor_id = ? OR ms.counsellor_id = 'system'
      ORDER BY ms.id ASC
    `;

    const [rows] = await db.query(query, [counsellor_id, counsellor_id, counsellor_id]);

    const schemes = rows.map(r => ({
      id: r.id,
      name: r.name,
      counsellor_id: r.counsellor_id,
      isEnabled: r.isEnabled === 1 || r.isEnabled === true,
      isSystemDefault: r.isSystemDefault === 1 || r.isSystemDefault === true,
      isLocked: r.isLocked === 1 || r.isLocked === true,
      appliedGroupCount: Number(r.appliedGroupCount) || 0,
      appliedSubgroupCount: Number(r.appliedSubgroupCount) || 0
    }));

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marking schemes fetched successfully!"],
      data: { schemes }
    });
  } catch (error) {
    console.error("Error fetching marking schemes list:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error fetching marking schemes list."]
    });
  }
});

export const createMarkingScheme = asyncHandler(async (req, resp) => {
  try {
    const { isValid, errors } = validateFields(mergeParam(req), {
      name: ["required"],
      counsellor_id: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const { name, counsellor_id, assignments } = mergeParam(req);
    const assignList = assignments || [];

    // 1. Insert the scheme record
    const [insertRes] = await db.query(
      "INSERT INTO marking_schemes (name, counsellor_id, is_enabled) VALUES (?, ?, 1)",
      [name, counsellor_id]
    );
    const schemeId = insertRes.insertId;

    // 2. Clone/copy rules of system default scheme to the new scheme in marking_rules table
    const [defaultRules] = await db.query("SELECT * FROM marking_rules WHERE counsellor_id = 'system' AND status = 1");
    
    if (defaultRules && defaultRules.length > 0) {
      const columns = [
        "center_id",
        "master_activity_id",
        "remark",
        "frequency",
        "condition_operator",
        "condition_value",
        "marks",
        "counsellor_id",
        "status"
      ];

      for (const rule of defaultRules) {
        const values = [
          schemeId,
          rule.master_activity_id,
          rule.remark || "",
          rule.frequency || "Daily",
          rule.condition_operator,
          rule.condition_value,
          rule.marks,
          counsellor_id,
          1
        ];
        await insertRecord("marking_rules", columns, values);
      }
    }

    // 3. Process assignments (overwrite any existing assignment)
    for (const a of assignList) {
      if (a.type === 'group') {
        await db.query("UPDATE center_list SET marking_scheme_id = ? WHERE center_id = ?", [schemeId, a.id]);
      } else if (a.type === 'subgroup') {
        await db.query("UPDATE labels_list SET marking_scheme_id = ? WHERE id = ?", [schemeId, a.id]);
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marking scheme created successfully!"],
      data: { id: schemeId, name, isEnabled: true, isProvisional: false }
    });

  } catch (error) {
    console.error("Error creating marking scheme:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error creating marking scheme."],
    });
  }
});

export const getSchemeActivitiesList = asyncHandler(async (req, resp) => {
  try {
    const { scheme_id, counsellor_id } = mergeParam(req);

    if (!counsellor_id) {
      return resp.json({ status: 0, code: 422, message: ["counsellor_id is required"] });
    }

    const query = `
      SELECT id, name, description, unit, target, activity_type, counsellor_id, status
      FROM activities
      WHERE (counsellor_id = ? OR counsellor_id IS NULL)
      AND status IN (1, 2, 3)
      ORDER BY id ASC
    `;

    const [rows] = await db.query(query, [counsellor_id]);

    const activities = rows.map(r => {
      let icon = '🎯';
      const name = r.name || '';
      if (name.toLowerCase().includes('chant')) icon = '📿';
      else if (name.toLowerCase().includes('read')) icon = '📖';
      else if (name.toLowerCase().includes('hear')) icon = '👂';
      else if (name.toLowerCase().includes('service') || name.toLowerCase().includes('clean')) icon = '🧹';
      else if (name.toLowerCase().includes('shloka') || name.toLowerCase().includes('memorise')) icon = '📜';
      else if (name.toLowerCase().includes('sleep')) icon = '😴';
      else if (name.toLowerCase().includes('wake')) icon = '🌅';
      else if (name.toLowerCase().includes('mangal') || name.toLowerCase().includes('aarti')) icon = '🙏';

      return {
        id: r.id,
        name: r.name,
        icon: icon,
        badge: r.activity_type ,
        unit: r.unit || '',
        target: r.target || ''
      };
    });

    return resp.json({
      status: 1,
      code: 200,
      message: ["Selectable activities fetched successfully!"],
      data: activities
    });

  } catch (error) {
    console.error("Error fetching scheme activities list:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Error fetching scheme activities list."]
    });
  }
});

export const updateMarkingScheme = asyncHandler(async (req, resp) => {
  try {
    const { isValid, errors } = validateFields(mergeParam(req), {
      scheme_id: ["required"],
      counsellor_id: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    const { scheme_id, counsellor_id, name, assignments } = mergeParam(req);
    const assignList = assignments || [];

    const [sysCheck] = await db.query("SELECT counsellor_id FROM marking_schemes WHERE id = ?", [scheme_id]);
    if (sysCheck && sysCheck.length > 0 && sysCheck[0].counsellor_id === 'system') {
      return resp.json({ status: 0, code: 403, message: ["Cannot edit the system default scheme."] });
    }

    const [ownerRows] = await db.query(
      "SELECT id, name FROM marking_schemes WHERE id = ? AND counsellor_id = ?",
      [scheme_id, counsellor_id]
    );
    if (!ownerRows || ownerRows.length === 0) {
      return resp.json({ status: 0, code: 403, message: ["Scheme not found or access denied."] });
    }

    if (name && name.trim()) {
      await db.query("UPDATE marking_schemes SET name = ? WHERE id = ?", [name.trim(), scheme_id]);
    }

    // Unlink old assignments
    await db.query(`UPDATE center_list SET marking_scheme_id = (SELECT id FROM marking_schemes WHERE counsellor_id = 'system' LIMIT 1) WHERE marking_scheme_id = ?`, [scheme_id]);
    await db.query(`UPDATE labels_list SET marking_scheme_id = (SELECT id FROM marking_schemes WHERE counsellor_id = 'system' LIMIT 1) WHERE marking_scheme_id = ?`, [scheme_id]);

    // Apply new assignments (overwrite any existing)
    for (const a of assignList) {
      if (a.type === 'group') {
        await db.query("UPDATE center_list SET marking_scheme_id = ? WHERE center_id = ?", [scheme_id, a.id]);
      } else if (a.type === 'subgroup') {
        await db.query("UPDATE labels_list SET marking_scheme_id = ? WHERE id = ?", [scheme_id, a.id]);
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marking scheme updated successfully."],
    });
  } catch (error) {
    console.error("Error updating marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error updating marking scheme."] });
  }
});

export const deleteMarkingScheme = asyncHandler(async (req, resp) => {
  try {
    const { scheme_id, counsellor_id } = mergeParam(req);

    if (!scheme_id || !counsellor_id) {
      return resp.json({ status: 0, code: 422, message: ["scheme_id and counsellor_id are required"] });
    }

    const [sysCheck] = await db.query("SELECT counsellor_id FROM marking_schemes WHERE id = ?", [scheme_id]);
    if (sysCheck && sysCheck.length > 0 && sysCheck[0].counsellor_id === 'system') {
      return resp.json({ status: 0, code: 403, message: ["Cannot delete the system default scheme."] });
    }

    const [ownerRows] = await db.query(
      "SELECT id FROM marking_schemes WHERE id = ? AND counsellor_id = ?",
      [scheme_id, counsellor_id]
    );
    if (!ownerRows || ownerRows.length === 0) {
      return resp.json({ status: 0, code: 403, message: ["Scheme not found or access denied."] });
    }

    await db.query("DELETE FROM marking_rules WHERE center_id = ?", [scheme_id]);

    await db.query(`UPDATE center_list SET marking_scheme_id = (SELECT id FROM marking_schemes WHERE counsellor_id = 'system' LIMIT 1) WHERE marking_scheme_id = ?`, [scheme_id]);
    await db.query(`UPDATE labels_list SET marking_scheme_id = (SELECT id FROM marking_schemes WHERE counsellor_id = 'system' LIMIT 1) WHERE marking_scheme_id = ?`, [scheme_id]);

    await db.query("DELETE FROM marking_schemes WHERE id = ?", [scheme_id]);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Marking scheme and all its rules deleted successfully."],
    });
  } catch (error) {
    console.error("Error deleting marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error deleting marking scheme."] });
  }
});
