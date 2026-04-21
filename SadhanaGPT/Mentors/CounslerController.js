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
      const [labels] = await db.execute(
      `
      SELECT 
        ll.id AS label_id,
        CONCAT(ll.name, ' ', COUNT(ua.user_id)) AS label_name
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
      `SELECT id FROM labels_list WHERE counsellor_id = ? AND name = ?`,
      [user_id, lable_name]
    );

    let label_id;

    if (existingLabel.length > 0) {
      label_id = existingLabel[0].id;
    } else {
      // ✅ Create new label
      const labelInsert = await insertRecord(
        "labels_list",
        ["counsellor_id","center_id", "name"],
        [user_id,center_id, lable_name]
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
  const { user_id,label_id, lable_name } = request;

  const { isValid, errors } = validateFields(request, {
    label_id: ["required"],
    lable_name: ["required"],
    user_id:["required"]
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
      ,["id","counsellor_id"],

      [label_id,user_id]
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

export const deleteLable = asyncHandler(async (req, res) => {

  const { label_id } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    label_id: ["required"]
  });

  if (!isValid) {
    return res.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  try {

    // Check label exists
    const [[label]] = await db.execute(
      `SELECT id FROM labels_list WHERE id = ?`,
      [label_id]
    );

    if (!label) {
      return res.json({
        status: 0,
        code: 404,
        message: ["Label not found"]
      });
    }

    // Delete label (label_centers rows auto delete via CASCADE)
    await db.execute(
      `DELETE FROM labels_list WHERE id = ?`,
      [label_id]
    );

    return res.json({
      status: 1,
      code: 200,
      message: ["Label deleted successfully"]
    });

  } catch (err) {

    console.log("delete label error", err);

    return res.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});
export const bulkAssignLabel = asyncHandler(async (req, res) => {

  const {user_id,center_id,label_id, student_ids } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    label_id: ["required"],
    student_ids: ["required"],
      user_id:["required"],
    center_id:["required"],
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
      [label_id,center_id]
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

    const { user_id, name, city='', temple_id } = request;

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

    const temple=await queryDB(
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

    if (!center.length) {
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
    await queryDB(
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

    // ✅ Delete center
    await queryDB(
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

export const studentlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      center_id,
       label_id,
      search_text = "",
      rowSelected,
      categroy
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
/*
DATEDIFF(CURDATE(), DATE(us.created_at)) + 1 AS total_days, 
       
      (SELECT COUNT(DISTINCT DATE(dr.activity_date)) FROM daily_report dr where dr.user_id=us.user_id )attended_days,
      ROUND(
      (
        (SELECT COUNT(DISTINCT DATE(dr.activity_date)) 
         FROM daily_report dr 
         WHERE dr.user_id = us.user_id)
        /
        (DATEDIFF(CURDATE(), DATE(us.created_at)) + 1)
      ) * 100, 2
    ) AS performance_percentage,
*/
    const params = {
      tableName: "users us",
      columns: `
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

    const { student_id,user_id } = mergeParam(req);

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
         fa.own_by = 1  OR fa.user_id = ? GROUP BY fa.activity_id
      `,
      [student_id,student_id,student_id]
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

export const studentActivityDetail = asyncHandler(async (req,res)=>{
 const { student_id, activity_id, user_id,start_date,end_date,filter='7days'    } = mergeParam(req);
     const { isValid, errors } = validateFields(mergeParam(req), {
      student_id: ["required"],
      activity_id: ["required"],
    });

    if (!isValid)      return res.json({ status: 0, code:422, message: errors });
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


console.log("filter",filter,start_formatted_date,end_formatted_date)
  
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
      [student_id,activity_id,start_date,end_date]
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
      [student_id,student_id,activity_id,user_id]
    );

    const attendance_days=student_data[0].attendance_count 
   const total_days = moment(end_formatted_date).diff(moment(start_formatted_date), "days") + 1;
   const performance_filter = ((attendance_days / total_days) * 100).toFixed(2);
student_data[0].performance_filter = performance_filter;
//
student_data[0].bestStreak = bestStreak;


// console.log(attendance_days,end_formatted_date,start_formatted_date,"student data",performance);
 return res.json({
   status:1,
 data:{student_data,chart_data:mergedData}
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
      columns: `cl.center_id, cl.name, cl.city,(SELECT COUNT(*) FROM users usr
            WHERE usr.center_id = cl.center_id) AS total_student`,
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

    const { user_id, center_id,label_id, student_ids=[] } = request;

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
    if(updateResult){
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
    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      center_id: ["required"],
      student_ids: ["required"]
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
    
    if (!Array.isArray(student_ids) || !student_ids.length) {
      return resp.json({ status: 0, code: 400, message: ["student_ids must be an array"] });
    }

    // check center exists
    const center = await queryDB(
      `SELECT center_id AS id, counsller_id FROM center_list WHERE center_id = ?`,
      [center_id]
    );

    if (!center || (Array.isArray(center) && center.length === 0)) {
      return resp.json({ status: 0, code: 404, message: ["Center not found"] });
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
    const [rows] = await db.execute(
      `SELECT 
        dr.activity_date,
        dr.activity_id,
        fa.name as activity_name,
        fa.own_by
        dr.count,
        dr.unit
      FROM daily_report dr
      INNER JOIN fix_activities fa 
      ON fa.activity_id = dr.activity_id and fa.own_by = 0
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
    const { user_id,student_ids, date_from, date_to } = mergeParam(req);

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
    const [rows] = await db.execute(
      `SELECT
         dr.user_id,
         dr.activity_date,
         dr.activity_id,
         fa.name as activity_name,
         fa.target,
         dr.count
       
      FROM daily_report dr
      INNER JOIN fix_activities fa 
        ON fa.activity_id = dr.activity_id 
        AND fa.own_by = 0
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
    and fa.own_by=0
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

  const { student_id, heading='', description,user_id  } = req.body;
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
  const href="cusotm_notification"
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
    const { isValid, errors }   = validateFields(mergeParam(req), { page_no: ["required"],});

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit = 10;
    const start = parseInt((page_no * limit) - limit, 10);

    const totalRows  = await queryDB(`SELECT COUNT(*) AS total FROM notifications WHERE panel_to = ? and status = '0' `, ['counsellor']);
    if(getCount){
     
        return resp.json({ 
            status : 1, 
            code       : 200, 
            message    : ["Notification Count Only"], 
            data       : [], 
            total_page : 0, 
            totalRows  : totalRows.total
        });
    }
    const total_page = Math.ceil(totalRows.total / limit) || 1; 
    const [rows] = await db.execute(`SELECT id, heading, description, module_name, panel_to, panel_from, receive_id, status, ${formatDateTimeInQuery(['created_at'])}, href
        FROM notifications WHERE  and panel_to = 'counsellor' ORDER BY id DESC LIMIT ${start}, ${parseInt(limit)} 
    `, []);
    
    const notifications = rows;  // and status = 0 
    await db.execute(`UPDATE notifications SET status=? WHERE status=? AND panel_to=?`, ['1', '0', 'counsellor']);
    
    return resp.json({ 
        status     : 1, 
        code       : 200, 
        message    : ["Notification list fetch successfully"], 
        data       : notifications, 
        total_page : total_page, 
        totalRows  : totalRows.total
    });
});


export const addNote = asyncHandler(async (req, res) => {

try {
  const { user_id, student_id, note_text,meeting_date } = req.body;

  

  const [result] = await db.execute(
    `INSERT INTO notes (counsellor_id, student_id, note_text,meeting_date)
     VALUES (?, ?, ?,?)`,
    [user_id, student_id, note_text,meeting_date]
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


export const editNote = asyncHandler(async (req, res) => {

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
        content_type:  ["required"],
        content:       ["required"],
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
export const addContent = asyncHandler(async (req, resp) => {
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
        const imageFile = uploadedFiles?.['image']?.[0];
        if (!imageFile) {
            return resp.json({
                status: 0,
                code: 422,
                message: { image: 'Image file is required when content_type is image' }
            });
        }
        // Use the file URL generated by uploadFiles
        content = imageFile.file_url; 
    }

    // 5. Validation (with the newly populated content/body)
    const { isValid, errors } = validateFields({ ...request, content }, {
        counsellor_id: ["required"],
        content_type:  ["required"],
        content:       ["required"],
    });

    if (!isValid) {
        return resp.json({ status: 0, code: 422, message: errors });
    }
console.log("counsellor_id, content_type, content",counsellor_id, content_type, content);
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
export const updateReportSettings = async (req, res) => {
    try {
        const { user_id, auto_report_status, report_frequency_days } = req.body;
        if (!user_id) {
            return res.status(400).json({ 
                success: false, 
                message: "user_id is thoroughly required." 
            });
        }
        // Sanitize inputs (Convert undefined to null so SQL IFNULL handles it elegantly)
        const statusValue = auto_report_status !== undefined ? Number(auto_report_status) : null;
        const frequencyValue = report_frequency_days !== undefined ? Number(report_frequency_days) : null;
        // Perform a safe update using IFNULL. 
        // If a parameter is skipped by the frontend, the DB keeps its current value intact.
        const [result] = await db.execute(`
            UPDATE users 
            SET 
                auto_report_status = IFNULL(?, auto_report_status), 
                report_frequency_days = IFNULL(?, report_frequency_days) 
            WHERE user_id = ?
        `, [statusValue, frequencyValue, user_id]);
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