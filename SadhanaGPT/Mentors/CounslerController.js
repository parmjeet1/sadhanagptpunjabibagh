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


export const addLable = asyncHandler(async (req, resp) => {

  const request = req.body;
  const { user_id, lable_name, center_ids = [] } = request;

  const { isValid, errors } = validateFields(request, {
    user_id: ["required"],
    lable_name: ["required"],
    center_ids: ["required"]
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors
    });
  }

  try {

    // 1️⃣ Insert Label
    const labelInsert = await insertRecord(
      "labels_list",
      ["counsellor_id", "name"],
      [user_id, lable_name]
    );

    const label_id = labelInsert.insertId;

    // 2️⃣ Prepare center mappings
    const values = center_ids.map(center_id => [label_id, center_id]);

    // 3️⃣ Insert center mappings
    for (const center of values) {
      await insertRecord(
        "label_centers",
        ["label_id", "center_id"],
        center
      );
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Label added successfully!"],
      data: {
        label_id: label_id
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
       label_id,
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
      
      params.whereField.push("us.center_id");
      params.whereValue.push(center_id);
      params.whereOperator.push("=");
    }
    if(label_id){
      params.whereField.push("us.label_id");
      params.whereValue.push(label_id);
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
export const getSadhanaAIAnalysis = async (report) => {
  try {
   const url="https://api.openai.com/v1/chat/completions";
   console.log("process.env.OPENAI_API_KEY", process.env.OPENAI_API_KEY);
    const response = await axios.post(
      url,
      {
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
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    

    const data = await response.json();

    return data?.choices?.[0]?.message?.content || "AI analysis unavailable";

  } catch (error) {
    // console.error("AI Error:", error);
    return "AI analysis failed";
  }
};

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

  const { student_id, heading, description,user_id  } = req.body;
  // const created_by = req.user?.user_id 

  const { isValid, errors } = validateFields(mergeParam(req), {
    student_id: ["required"],
    heading: ["required"],
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