import db from "../../config/database.js";
import fetch from "node-fetch";
import dotenv from 'dotenv';
dotenv.config();
import {
  getPaginatedData,
  insertRecord,
  queryDB,
} from "../../utils/dbUtils.js";
import { asyncHandler, mergeParam } from "../../utils/utils.js";
import validateFields from "../../utils/validation.js";


export const addCenter = asyncHandler(async (req, resp) => {
  try {
    const request = req.body;

    const { user_id, name, city, temple_id } = request;

    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      name: ["required"],
      city: ["required"],
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
        message: ["Center added successfully!"],
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
      search_text = "",
      rowSelected,
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

      us.user_id, 
      (SELECT name from center_list cl where us.center_id=cl.center_id) as center_name,
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
    if (center_id) {
      console.log("center id", center_id);
      params.whereField.push("us.center_id","uc.counsller_id");
      params.whereValue.push(center_id,user_id);
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
export const studentsadhnaDetails = asyncHandler(async (req, resp) => {
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
    const activitySummary = await queryDB(
      `
      SELECT 
        activity_id,
        COUNT(*) AS activity_count
      FROM daily_report
      WHERE user_id = ?
      GROUP BY activity_id
      `,
      [student_id]
    );

    /* ---------------------------
       4️⃣ Daily chart data
    ----------------------------*/
    const dailyActivity = await queryDB(
      `
      SELECT 
        DATE(activity_date) as date,
        COUNT(*) as total_activities
      FROM daily_report
      WHERE user_id = ?
      GROUP BY DATE(activity_date)
      ORDER BY date
      `,
      [student_id]
    );

    return resp.json({
      status: 1,
      student: student[0],
      attendance: attendance[0],
      activity_summary: activitySummary,
      daily_activity_chart: dailyActivity
    });

  } catch (error) {
    console.error(error);
    resp.json({ status: 0, message: "Server error" });
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
console.log("rows", rows);
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
        unit: r.unit
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

    return resp.json({
      status: 1,
      data: report
    });

  } catch (error) {
    console.error(error);
    resp.json({ status: 0, message: "Server error" });
  }
});
export const getSadhanaAIAnalysis = async (report) => {
  try {

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are a sādhana analytics assistant.
Analyze student sādhana logs and return a MARKDOWN TABLE.

Columns:
Date | Wake-up | Chanting Rounds | Reading (min) | Hearing (min) | Remarks
`
          },
          {
            role: "user",
            content: JSON.stringify(report)
          }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();

    return data?.choices?.[0]?.message?.content || "AI analysis unavailable";

  } catch (error) {
    console.error("AI Error:", error);
    return "AI analysis failed";
  }
};

export const centerlist = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      search_text = "",
      rowSelected,
    } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    /*
        center list
        name,
city,student count as per center list
        */
    const params = {
      tableName: "center_list cl",
      columns: `cl.name, cl.city,(SELECT COUNT(*) FROM users usr
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
      columns: `fa.activity_id, fa.name, fa.description,  dr.activity_date, dr.count, dr.unit`,
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

export const bulkAssignStudents = asyncHandler(async (req, resp) => {

  try {

    const request = req.body;

    const { user_id, center_id, student_ids } = request;

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

    // security check
    if (center.counsller_id != user_id) {
      return resp.json({
        status: 0,
        code: 403,
        message: ["Not authorized"]
      });
    }

    // bulk update
    await queryDB(
      `UPDATE users
       SET center_id = ?
       WHERE id IN (?)`,
      [center_id, student_ids]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["Students assigned to center successfully"]
    });

  } catch (err) {

    console.log(err);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });

  }

});

