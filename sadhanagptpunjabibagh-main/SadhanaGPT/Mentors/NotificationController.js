import { asyncHandler, mergeParam } from "../../utils/utils.js";
import db from "../../config/database.js";
import { getPaginatedData } from "../../utils/dbUtils.js";

export const toggleMenteeNotification = asyncHandler(async (req, res) => {
  const { user_id, student_ids, status } = req.body; // user_id is the counsellor

  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.json({ status: 0, message: "No students selected" });
  }

  const placeholders = student_ids.map(() => '?').join(',');
  const query = `
    UPDATE user_counsellors 
    SET performance_notification = ? 
    WHERE counsller_id = ? AND user_id IN (${placeholders})
  `;

  await db.execute(query, [status, user_id, ...student_ids]);

  return res.json({
    status: 1,
    message: `Notifications ${status === 1 ? 'enabled' : 'disabled'} for ${student_ids.length} students`
  });
});
export const irregularMenteesList = asyncHandler(async (req, resp) => {
  try {
    const { page_no = 1, user_id, search_text = "", rowSelected } = mergeParam(req);

    const params = {
      tableName: "users us",
      columns: `
        us.user_id, us.name, us.email, us.mobile, us.profile as image, us.reminder_days,
        (SELECT cl.name FROM user_assignments ua INNER JOIN center_list cl ON cl.center_id = ua.center_id WHERE ua.user_id = us.user_id AND ua.counsellor_id = uc.counsller_id LIMIT 1) as center_name,
        (SELECT ll.name FROM user_assignments ua INNER JOIN labels_list ll ON ll.id = ua.label_id WHERE ua.user_id = us.user_id AND ua.counsellor_id = uc.counsller_id LIMIT 1) as label_name
      `,
      joinTable: "user_counsellors uc",
      joinCondition: "us.user_id = uc.user_id",
      sortColumn: "us.name",
      sortOrder: "ASC",
      page_no,
      limit: rowSelected || 10,
      liveSearchFields: ["us.name"],
      liveSearchTexts: [search_text],
      whereField: ["uc.counsller_id", "uc.performance_notification"],
      whereValue: [user_id, 1],
      whereOperator: ["=", "="],
    };

    // Corrected filter logic (One level deep subquery)
    params.whereField.push(`
      (
        -- Case 1: Total Miss
        (SELECT COUNT(*) FROM daily_report dr 
         WHERE dr.user_id = us.user_id 
         AND dr.activity_date >= DATE_SUB(CURDATE(), INTERVAL IFNULL(us.reminder_days, 3) DAY)) = 0
        
        OR
        
        -- Case 2: Below Targets
        EXISTS (
  SELECT 1 FROM fix_activities fa
  LEFT JOIN daily_report dr ON fa.activity_id = dr.activity_id 
    AND dr.user_id = us.user_id 
    AND dr.activity_date >= DATE_SUB(CURDATE(), INTERVAL IFNULL(us.reminder_days, 3) DAY)
  WHERE (fa.user_id = us.user_id OR fa.own_by = 0)
  AND fa.activity_type IN ('min', 'numb', 'rounds', 'page')
  
  -- Add target to GROUP BY so it is accessible in HAVING
  GROUP BY fa.activity_id, fa.target 
  
  HAVING IFNULL(SUM(dr.count), 0) < (CAST(fa.target AS DECIMAL) * IFNULL(us.reminder_days, 3) / 2)
)
      )
    `);
    params.whereValue.push(1);
    params.whereOperator.push("=");

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Irregular mentees list fetched!"],
      data: result.data.map(s => ({
        ...s,
        avatar: s.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=random`
      })),
      total_page: result.totalPage,
      total: result.total,
    });
    
  } catch (error) {
    console.error("Irregular List Error:", error);
    return resp.status(500).json({ status: 0, code: 500, message: "Server Error" });
  }
});

