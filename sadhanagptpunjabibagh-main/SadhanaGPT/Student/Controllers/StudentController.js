import { configDotenv } from "dotenv";
import bcrypt from "bcrypt";

import crypto from "crypto";
import fs from 'fs';
import path from 'path';
import {
  asyncHandler,
  checkNumber,
  formatDateTimeInQuery,
  generateOTP,
  mergeParam,
} from "../../../utils/utils.js";
import validateFields from "../../../utils/validation.js";
import {
  deleteRecord,
  getPaginatedData,
  insertRecord,
  queryDB,
  updateRecord,
} from "../../../utils/dbUtils.js";
import moment from "moment";
import db from "../../../config/database.js";
import emailQueue from "../../../utils/emails/emailQueue.js";
import { Console } from "console";
import { dailyStudentSummary } from '../../Controllers/SummaryData/summary-report.js';


export const parseTimeToMinutes = (val) => {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return val;
  const str = String(val).trim();

  if (!isNaN(Number(str))) return Number(str);

  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : null;
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  return NaN;
};

const parseValToNumber = (val, isTime = false, isYesNo = false) => {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;

  const str = String(val).trim();
  const lower = str.toLowerCase();

  if (isYesNo || lower === 'yes' || lower === 'no' || lower === 'true' || lower === 'false') {
    if (lower === 'yes' || lower === 'true' || lower === 'y' || lower === '1') return 1;
    if (lower === 'no' || lower === 'false' || lower === 'n' || lower === '0') return 0;
    if (!isNaN(Number(str))) return Number(str);
  }

  if (isTime) {
    return parseTimeToMinutes(val);
  }

  if (!isNaN(Number(str))) return Number(str);
  return parseFloat(str);
};

export const calculateBestMarks = (rawCount, rules, activityType, unit, activityName) => {
  if (!rules || rules.length === 0) return null;
  console.log("calculation best marks", rawCount, rules, activityType, unit, activityName);
  
  let bestMarks = null;
  const isTime = activityType === 'time';
  const isYesNo = activityType === 'yes_no' || activityType === 'boolean';

  let userValNum = parseValToNumber(rawCount, isTime, isYesNo);

  if (unit && (unit.toLowerCase() === 'hrs' || unit.toLowerCase() === 'hours' || unit.toLowerCase() === 'hr' || unit.toLowerCase() === 'hour')) {
    if (typeof rawCount === 'number' || !isNaN(Number(rawCount))) {
      userValNum = userValNum * 60;
    }
  }

  // Check if this time rule set involves late night / evening times (e.g. > 12:00 PM / 720 mins)
  const hasEveningRules = isTime && rules.some(r => {
    const val = parseValToNumber(r.condition_value, true, false);
    return !isNaN(val) && val > 720;
  });

  if (isTime && hasEveningRules) {
    // If user entered time in early morning (00:00 to 05:59 AM, i.e., < 360 mins), adjust by +1440 mins (24h)
    if (!isNaN(userValNum) && userValNum < 360) {
      userValNum += 1440;
    }
  }

  for (const rule of rules) {
    let ruleValNum = parseValToNumber(rule.condition_value, isTime, isYesNo);

    if (isTime && hasEveningRules && !isNaN(ruleValNum) && ruleValNum < 360) {
      ruleValNum += 1440;
    }

    if (isNaN(userValNum) || isNaN(ruleValNum)) continue;

    let isMatched = false;
    switch (rule.condition_operator) {
      case '>': isMatched = userValNum > ruleValNum; break;
      case '<': isMatched = userValNum < ruleValNum; break;
      case '>=': isMatched = userValNum >= ruleValNum; break;
      case '<=': isMatched = userValNum <= ruleValNum; break;
      case '=':
      case '==': isMatched = userValNum == ruleValNum; break;
      case '!=': isMatched = userValNum != ruleValNum; break;
    }

    if (isMatched) {
      const ruleMarksNum = Number(rule.marks);
      if (bestMarks === null || ruleMarksNum > bestMarks) {
        bestMarks = ruleMarksNum;
      }
    }
  }
  console.log("marks is", bestMarks);

  return bestMarks;
};

export const studentRegister = asyncHandler(async (req, resp) => {
  const {
    name,
    age,
    country_code = "+91",
    user_type,
    mobile,
    email,
    password,
    counsller_id,
    added_from = "andorid",
    device_name = "web",
  } = mergeParam(req);
  const { isValid, errors } = validateFields(mergeParam(req), {
    name: ["required"],
    mobile: ["required"],
    email: ["required"],
    password: ["required"],
    counsller_id: ["required"],
    user_type: ["required"],
  });
  // console.log("mergeParam(req)",mergeParam(req))
  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  // const res = checkNumber("+91", mobile);
  // if(res.status == 0) return resp.json({ status:0, code:422, message: [res.msg] });

  const [[isExist]] = await db.execute(
    `
        SELECT COUNT(*) AS check_email FROM users AS u WHERE u.email = ?
    `,
    [email],
  );

  // if(isExist.check_mob > 0 || isExist.rsa_mob > 0 ) return resp.json({ status:0, code:422, message: ['The provided number already exists.'] });
  if (isExist.check_email > 0)
    return resp.json({
      status: 0,
      code: 422,
      message: ["Email already registered."],
    });

  const hashedPassword = await bcrypt.hash(password, 10);

  const student = await insertRecord(
    "users",
    [
      "user_id",
      "name",
      "email",
      "password",
      "mobile",
      "age",
      "status",
      "counsller_id",
      "added_from",
      "device_name",
      "user_type",
    ],
    [
      "U",
      name,
      email,
      hashedPassword,
      mobile,
      age,
      1,
      counsller_id,
      added_from || "WEB",
      device_name,
      user_type,
    ],
  );

  if (!student)
    return resp.json({
      status: 0,
      code: 405,
      message: ["Failed to register. Please Try Again"],
      error: true,
    });

  const user_id = "U" + String(student.insertId).padStart(4, "0");
  await db.execute("UPDATE users SET user_id = ? WHERE id = ?", [
    user_id,
    student.insertId,
  ]);

  const result = {
    user_id: user_id,
    name: name,
    email: email,
    country_code: country_code,
    mobile: mobile,
  };
  return resp.json({
    status: 1,
    code: 200,
    message: ["User registered successfully"],
    data: { user: result },
  });
});
export const addCounsller = asyncHandler(async (req, resp) => {
  // type mentor email id, and then find 
  const { studnet_id, counsler_email } = req.body;
})

export const Registertest = asyncHandler(async (req, resp) => {
  const { name, email, profile, added_from, fcm_token, device_name } = req.body;
  console.log(
    "name,email,profile,added_from,fcm_token",
    name,
    email,
    profile,
    added_from,
    fcm_token,
  );
  const result = await googleLogin(
    name,
    email,
    profile,
    added_from,
    fcm_token,
    device_name,
  );
  return resp.json(result);
});
const googleLogin = async (
  name,
  email,
  profile,
  added_from,
  fcm_token,
  device_name,
) => {
  const data = { name, email, profile, added_from, fcm_token, device_name };
  const { isValid, errors } = validateFields(data, {
    email: ["required", "email"],
    profile: ["required"],
    fcm_token: ["required"],
  });

  if (!isValid) return { status: 0, code: 422, message: errors };
  console.log("email", email);
  const [[user_data]] = await db.execute(
    `SELECT user_id, name, email FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  let result;
  const access_token = crypto.randomBytes(12).toString("hex");
  if (!user_data) {
    //added_from,added_from
    const [[isExist]] = await db.execute(
      `
        SELECT COUNT(*) AS check_email FROM users AS u WHERE u.email = ?
    `,
      [email],
    );

    if (isExist.check_email > 0)
      return resp.json({
        status: 0,
        code: 422,
        message: ["Email already registered."],
      });

    const student = await insertRecord(
      "users",
      [
        "name",
        "email",
        "access_token",
        "fcm_token",
        "profile",
        "added_from",
        "device_name",
      ],
      [name, email, access_token, fcm_token, profile, added_from, device_name],
    );
    console.log("student.insertId", student.insertId);
    if (!student)
      return resp.json({
        status: 0,
        code: 405,
        message: ["Failed to register. Please Try Again"],
        error: true,
      });

    const updated_data = await queryDB(
      `SELECT user_id FROM users WHERE id = ? LIMIT 1`,
      [student.insertId],
    );
    result = {
      student_id: updated_data.user_id,
      name: name,
      email: email,
      access_token: access_token,
      profile: profile,
    };
    return {
      status: 1,
      code: 200,
      message: ["successfully Logged in!"],
      data: result,
    };
  }

  const [update] = await db.execute(
    fcm_token 
      ? `UPDATE users SET access_token = ?, fcm_token = ? WHERE email = ?`
      : `UPDATE users SET access_token = ? WHERE email = ?`,
    fcm_token ? [access_token, fcm_token, email] : [access_token, email],
  );
  if (update.affectedRows > 0) {
    result = {
      student_id: user_data.user_id,
      name: name,
      email: email,
      access_token: access_token,
      profile: profile,
    };

    return {
      status: 1,
      is_logged_id: 1,
      code: 200,
      message: ["successfully Logged in !"],
      data: result,
    };
  } else {
    return {
      status: 0,
      code: 405,
      message: ["Oops! There is something went wrong! Please Try Again"],
      error: true,
    };
  }
};
export const login = asyncHandler(async (req, resp) => {
  const { email, password, fcm_token } = mergeParam(req);

  const { isValid, errors } = validateFields(mergeParam(req), {
    email: ["required"],
    password: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const [[user_data]] = await db.execute(
    `SELECT user_id, name, email,user_type,counsller_id, password FROM users WHERE email = ? LIMIT 1`,
    [email],
  );

  if (!user_data)
    return resp.json({
      status: 0,
      code: 422,
      message: ["The Email number is not registered with us. Kindly sign up."],
    });
  const isMatch = await bcrypt.compare(password, user_data.password);
  if (!isMatch)
    return resp.json({
      status: 0,
      code: 405,
      error: true,
      message: ["Password is incorrect"],
    });
  if (user_data.status == 2)
    return resp.json({
      status: 0,
      code: 405,
      error: true,
      message: [
        "You can not login as your status is inactive. Kindly contact to customer care",
      ],
    });

  const token = crypto.randomBytes(12).toString("hex");
  console.log("token", token);
  const [update] = await db.execute(
    fcm_token
      ? `UPDATE users SET access_token = ?, status = ?, fcm_token = ? WHERE email = ?`
      : `UPDATE users SET access_token = ?, status = ? WHERE email = ?`,
    fcm_token ? [token, 1, fcm_token, email] : [token, 1, email],
  );
  if (update.affectedRows > 0) {
    const result = {
      // image_url    : `${process.env.DIR_UPLOADS}rider_profile/`,
      user_id: user_data.user_id,
      name: user_data.name,
      email: user_data.email,
      mobile: user_data.mobile,
      access_token: token,
      user_type: user_data.user_type,
      // counsller_id:user_data.counsller_id
    };
    user_data.user_type === "student"
      ? (result.counsller_id = user_data.counsller_id)
      : null;

    return resp.json({
      status: 1,
      is_logged_id: 1,
      code: 200,
      message: ["successfully Logged in !"],
      data: { user: result },
    });
  } else {
    return resp.json({
      status: 0,
      code: 405,
      message: ["Oops! There is something went wrong! Please Try Again"],
      error: true,
    });
  }
});

export const logout = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  if (!user_id)
    return resp.json({
      status: 0,
      code: 422,
      message: ["Rider Id is required"],
    });


  const update = await updateRecord(
    "users",
    { status: 0, access_token: "" },
    ["user_id"],
    [user_id],
  );

  if (update.affectedRows > 0) {
    return resp.json({
      status: 1,
      code: 200,
      message: "Logged out sucessfully",
    });
  } else {
    return resp.json({
      status: 0,
      code: 405,
      message: "Oops! There is something went wrong! Please Try Again",
    });
  }
});
export const forgetPassword = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  if (!user_id)
    return resp.json({
      status: 0,
      code: 422,
      message: ["user Id is required"],
    });
  const [[user_data]] = await db.execute(
    `SELECT user_id, name, email FROM users WHERE user_id = ? LIMIT 1`,
    [user_id],
  );

  if (!user_data)
    return resp.json({
      status: 0,
      code: 422,
      message: ["The Email number is not registered with us. Kindly sign up."],
    });

  const otp_value = generateOTP(4);
  const htmlUser = `<html>
           <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <h3 style="color:#2c3e50;">Hello ${user_data.name},</h3>

  <p>We received a request to verify your account. Please use the following One-Time Password (OTP) to complete the process:</p>

  <p style="font-size: 20px; font-weight: bold; color: #e74c3c; letter-spacing: 3px;">
    ${otp_value}
  </p>

  <p>This OTP is valid for <strong>10 minutes</strong>. Please do not share it with anyone for security reasons.</p>

  <p>If you did not request this verification, please ignore this email.</p>

  <br/>
  <p>Best regards, <br/> <strong>Gita Joy</strong></p>
</body>
        </html>`;
  const mail_sent = emailQueue.addEmail(user_data.email, "OTP", htmlUser);
  console.log("mail_sent", mail_sent);

  updateRecord("users", { otp: otp_value }, ["user_id"], [user_id]);

  return resp.json({
    status: 1,
    code: 200,
    message: "OTP has been sent to your Email. ",
  });
});

export const verifyOTP = asyncHandler(async (req, resp) => {
  const { user_id, otp } = mergeParam(req);
  if (!user_id)
    return resp.json({
      status: 0,
      code: 422,
      message: ["user Id is required"],
    });
  const [[user_data]] = await db.execute(
    `SELECT otp FROM users WHERE user_id = ? LIMIT 1`,
    [user_id],
  );

  if (!user_data)
    return resp.json({
      status: 0,
      code: 422,
      message: ["The Email number is not registered with us. Kindly sign up."],
    });
  console.log("user_data", user_data.otp, "user otp ", otp);

  if (user_data.otp != otp || user_data.otp == 0) {
    return resp.json({ status: 0, code: 201, message: ["Invailed OTP"] });
  }
  updateRecord("users", { otp: "" }, ["user_id"], [user_id]);

  return resp.json({ status: 1, code: 200, message: "verfied" });
});

export const addactivity = asyncHandler(async (req, resp) => {
  const { user_id, name, description = '', target, unit, status, activity_type } = req.body;
  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
    name: ["required"],
    // description: ["required"],
    unit: ["required"],
    activity_type: ["required"],
    status: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const insert_data = await insertRecord(
    "fix_activities",
    ["user_id", "name", "description", "unit", "activity_type", "own_by", "target"],
    [user_id, name, description, unit, activity_type, status, target],
  );
  if (insert_data) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["activity added successfully!"],
    });
  }
});
export const editActivity = asyncHandler(async (req, resp) => {
  const { activity_id, user_id, target, name, description = '', unit, status, activity_type } = req.body;
  console.log("mergeParam(req)", mergeParam(req))
  const { isValid, errors } = validateFields(mergeParam(req), {
    activity_id: ["required"],
    user_id: ["required"],
    name: ["required"],
    // description: ["required"],
    unit: ["required"],
    activity_type: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
  const update_data = await updateRecord(
    "fix_activities",
    {
      name,
      description,
      unit,
      activity_type,
      target,
      own_by: status
    },
    ["activity_id"],
    [activity_id]
  );

  if (update_data) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["Activity updated successfully!"],
    });
  }
});
export const deleteActivity = asyncHandler(async (req, resp) => {
  const { activity_id, user_id } = mergeParam(req);

  const { isValid, errors } = validateFields(mergeParam(req), {
    activity_id: ["required"],
    user_id: ["required"]
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Delete associated daily report logs for this user activity
    await connection.execute(
      `DELETE FROM daily_report WHERE activity_id = ? AND user_id = ?`,
      [activity_id, user_id]
    );

    // 2. Delete activity configuration from fix_activities
    const [result] = await connection.execute(
      `DELETE FROM fix_activities WHERE activity_id = ? AND user_id = ?`,
      [activity_id, user_id]
    );

    await connection.commit();

    return resp.json({
      status: 1,
      code: 200,
      message: ["Activity and all associated records deleted successfully!"],
      data: { affectedRows: result.affectedRows }
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error deleting activity:", error);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Failed to delete activity"],
    });
  } finally {
    connection.release();
  }
});

export const listActivities = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });


  const [all_activities] =
    await db.execute(`SELECT own_by as status,activity_id, name,description,unit,activity_type,target
        
         FROM fix_activities where user_id=?`, [user_id]);//

  // if (activities && activities.length=== 0) {
  // return resp.json({ status: 0, code: 404, message: ['No activities found for this user'] });
  // }

  const data = {
    all_activities,
  };
  return resp.json({ status: 1, code: 200, data });
});
export const oldtodayReportlist = asyncHandler(async (req, resp) => {
  const { user_id } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });
  const today_date = moment().format("YYYY-MM-DD");
  console.log("today_date", today_date);

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const [user_activities] = await db.execute(
    `SELECT 
      a.name, a.count_type, a.activity_type, r.note,r.activity_id,r.count
       from daily_report r
       JOIN f-xactivities a on r.activity_id=a.id
       where  r.user_id=? and DATE(r.created_at)=?
        `,
    [user_id, today_date],
  );

  const [fix_activities] = await db.execute(
    `SELECT 
      fa.name, fa.count_type, fa.activity_type, dr.note,dr.activity_id,dr.count
       from daily_report dr 
        JOIN fix_activities fa ON  fa.acitivity_id=dr.activity_id
       where  dr.user_id=? and DATE(dr.created_at)=?
        `,
    [user_id, today_date],
  );

  // if (!fix_activities && fix_activities.length=== 0 || user_activities) {
  // return resp.json({ status: 0, code: 404, message: ['No activities found for this user'] });
  // }
  const data = {
    fix_activities: fix_activities,
    user_activities: user_activities,
  };
  return resp.json({ status: 1, code: 200, data });
});
const calculateColorForActivities = (activitiesList) => {
  if (!activitiesList || activitiesList.length === 0) {
    return '#EF4444'; // Red (no activities assigned)
  }

  let total_assigned = activitiesList.length;
  let logged_count = 0;

  activitiesList.forEach(row => {
    // Check if activity is added in daily_report (non-null and non-empty)
    const hasLog = row.count !== null && row.count !== undefined && row.count !== '';
    if (hasLog) {
      logged_count++;
    }
  });

  if (logged_count === total_assigned && total_assigned > 0) {
    return '#10B981'; // Green (All assigned activities logged for this date)
  } else if (logged_count > 0) {
    return '#F59E0B'; // Yellow (Some activities logged for this date)
  } else {
    return '#EF4444'; // Red (No activities logged for this date)
  }
};

export const todayReportlist = asyncHandler(async (req, resp) => {
  const { user_id, activity_date } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
    activity_date: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  try {
    const [rows] = await db.execute(
      `SELECT activity_id, count 
       FROM daily_report
       WHERE user_id = ? AND DATE(activity_date) = ?`,
      [user_id, activity_date]
    );

    const [activityRows] = await db.execute(
      `SELECT 
        fa.activity_id, 
        fa.activity_type, 
        fa.target, 
        dr.count
       FROM fix_activities fa
       LEFT JOIN daily_report dr ON fa.activity_id = dr.activity_id AND dr.user_id = fa.user_id AND DATE(dr.activity_date) = ?
       WHERE fa.user_id = ?`,
      [activity_date, user_id]
    );

    const color = calculateColorForActivities(activityRows);

    const response = {
      user_id,
      color,
      activity_date,
      daily_reports: rows.map((item) => ({
        activity_id: item.activity_id,
        count: item.count,
      })),
    };

    return resp.json({
      status: 1,
      code: 200,
      data: response,
    });

  } catch (error) {
    return resp.json({
      status: 0,
      code: 500,
      message: error.message,
    });
  }
});

export const rangeReportColors = asyncHandler(async (req, resp) => {
  const { user_id, start_date, end_date } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
    start_date: ["required"],
    end_date: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  try {
    // 1. Fetch assigned activities once
    const [assignedActivities] = await db.execute(
      `SELECT activity_id, activity_type, target FROM fix_activities WHERE user_id = ?`,
      [user_id]
    );

    // 2. Fetch daily report logs for the date range
    const [logs] = await db.execute(
      `SELECT DATE_FORMAT(activity_date, '%Y-%m-%d') as log_date, activity_id, count 
       FROM daily_report 
       WHERE user_id = ? AND DATE(activity_date) BETWEEN ? AND ?`,
      [user_id, start_date, end_date]
    );

    // 3. Initialize mapping of date -> list of activities with count initialized to null
    const dateActivitiesMap = {};
    let start = new Date(start_date);
    let end = new Date(end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      dateActivitiesMap[dateStr] = assignedActivities.map(act => ({
        ...act,
        count: null
      }));
    }

    // 4. Populate counts from the logs
    logs.forEach(log => {
      const dateStr = log.log_date;
      if (dateActivitiesMap[dateStr]) {
        const act = dateActivitiesMap[dateStr].find(a => String(a.activity_id) === String(log.activity_id));
        if (act) {
          act.count = log.count;
        }
      }
    });

    // 5. Calculate colors for each date
    const colors = {};
    Object.keys(dateActivitiesMap).forEach(dateStr => {
      colors[dateStr] = calculateColorForActivities(dateActivitiesMap[dateStr]);
    });

    return resp.json({
      status: 1,
      code: 200,
      data: {
        user_id,
        colors
      }
    });

  } catch (error) {
    return resp.json({
      status: 0,
      code: 500,
      message: error.message,
    });
  }
});
export const detailReport = asyncHandler(async (req, resp) => {
  const { user_id, activity_id } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });

  if (activity_id.startsWith("f")) {
    const [activity_details] = await db.execute(
      `SELECT 
      a.name, a.count_type, a.activity_type, DATE_FORMAT(a.created_at, '%Y-%m-%d') as created_at
       from fix_activities a 
       where  a.activity_id=? limit 1
        `,
      [activity_id],
    );

    const [report] = await db.execute(
      `SELECT note,count,DATE_FORMAT(created_at, '%W') AS day,DATE_FORMAT(created_at, '%Y-%m-%d') as created_at
      from daily_report

       where  user_id=? and activity_id=?
        `,
      [user_id, activity_id],
    );
    const data = { detail: activity_details, report };
    return resp.json({
      status: 1,
      code: 200,
      message: ["fixactivity data"],
      data,
    });
  } else {
    const [activity_details] = await db.execute(
      `SELECT 
      a.name, a.count_type, a.activity_type, DATE_FORMAT(a.created_at, '%Y-%m-%d') as created_at
       from activities a 
       where  a.id=? limit 1
        `,
      [activity_id],
    );

    const [report] = await db.execute(
      `SELECT note,count,DATE_FORMAT(created_at, '%W') AS day,DATE_FORMAT(created_at, '%Y-%m-%d') as created_at
      from daily_report

       where  user_id=? and activity_id=?
        `,
      [user_id, activity_id],
    );
    const data = { detail: activity_details, report };

    return resp.json({
      status: 1,
      code: 200,
      message: ["activity data"],
      data,
    });
  }

  // console.log("today_date",today_date)

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
  /*
    const [user_activities] = await db.execute(`SELECT 
      a.name, a.count_type, a.activity_type, r.note,r.activity_id,r.count
       from daily_report r
       JOIN activities a on r.activity_id=a.id
       where  r.user_id=? and DATE(r.created_at)=?
        `,[user_id,today_date]);

        const [fix_activities] = await db.execute(`SELECT 
      fa.name, fa.count_type, fa.activity_type, dr.note,dr.activity_id,dr.count
       from daily_report dr 
        JOIN fix_activities fa ON  fa.acitivity_id=dr.activity_id
       where  dr.user_id=? and DATE(dr.created_at)=?
        `,[user_id,today_date]);

       


    // if (!fix_activities && fix_activities.length=== 0 || user_activities) {
    // return resp.json({ status: 0, code: 404, message: ['No activities found for this user'] });
    // }
    const data ={
        fix_activities:fix_activities,
        user_activities:user_activities

    }*/
});
export function minutesToTime(mins) {
  const hrs = Math.floor(mins / 60);
  const minsPart = mins % 60;
  const period = hrs >= 12 ? 'PM' : 'AM';
  const hour12 = hrs % 12 === 0 ? 12 : hrs % 12;
  return `${hour12}:${String(minsPart).padStart(2, '0')} ${period}`;
}


//with marking no testing
export const oldaddSadhna = asyncHandler(async (req, resp) => {

  const { activity_id, count, activity_date, note, user_id, unit } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    activity_id: ["required"],
    activity_date: ["required"],
    user_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const final_activity_date = moment(activity_date).format("YYYY-MM-DD");

  // 1. Fetch activity details separately (fixes bug where isTime was undefined on first insert)
  const [[activityInfo]] = await db.execute(
    `SELECT activity_type, master_activity_id FROM fix_activities WHERE activity_id = ? LIMIT 1`,
    [activity_id]
  );

  if (!activityInfo) {
    return resp.json({ status: 0, code: 404, message: ["Activity not found"] });
  }

  // --- NEW LOGIC: DELETE IF COUNT IS 0 ---
  if (Number(count) === 0) {
    await db.execute(
      "DELETE FROM daily_report WHERE activity_id = ? AND user_id = ? AND DATE(activity_date) = ?",
      [activity_id, user_id, final_activity_date]
    );
    //select students. in this UI route counsellor/group-ment

    return resp.json({
      status: 1,
      code: 200,
      message: ["Activity reset successfully!"],
      data: {},
    });
  }
  // ---------------------------------------

  // 2. Evaluate Marking Rules dynamically based on primary counsellor
  let achievedMarks = 0;

  if (activityInfo.master_activity_id) {
    // Find primary counsellor
    const [[primaryCounsellor]] = await db.execute(
      `SELECT counsller_id FROM user_counsellors WHERE user_id = ? AND counsllor_type = 'primary' LIMIT 1`,
      [user_id]
    );

    if (primaryCounsellor) {
      // Find rules for this activity
      const [[rule]] = await db.execute(
        `SELECT condition_operator, condition_value, marks 
         FROM marking_rules 
         WHERE counsellor_id = ? AND master_activity_id = ? AND frequency = 'daily' AND status = 1 LIMIT 1`,
        [primaryCounsellor.counsller_id, activityInfo.master_activity_id]
      );

      if (rule) {
        const rawCount = Number(count);
        const ruleValue = parseFloat(rule.condition_value);
        let isMatched = false;

        switch (rule.condition_operator) {
          case '>': isMatched = rawCount > ruleValue; break;
          case '<': isMatched = rawCount < ruleValue; break;
          case '>=': isMatched = rawCount >= ruleValue; break;
          case '<=': isMatched = rawCount <= ruleValue; break;
          case '=':
          case '==': isMatched = rawCount == ruleValue; break;
          case '!=': isMatched = rawCount != ruleValue; break;
        }

        if (isMatched) achievedMarks = rule.marks;
      }
    }
  }

  // 3. Format the count properly
  const isTime = activityInfo.activity_type === 'time';
  const storedCount = isTime ? minutesToTime(Number(count)) : count;

  // 4. Check if record already exists for today
  const [[check_today_sadhana]] = await db.execute(
    `SELECT activity_id FROM daily_report WHERE activity_id = ? AND user_id = ? AND DATE(activity_date) = ?`,
    [activity_id, user_id, final_activity_date]
  );

  if (check_today_sadhana) {
    // Make sure your daily_report table has a `marks` column!
    await updateRecord(
      "daily_report",
      { count: storedCount, marks: achievedMarks },
      ["activity_id", "user_id", "activity_date"],
      [activity_id, user_id, final_activity_date]
    );

    return resp.json({
      status: 1,
      code: 200,
      message: ["updated activity!"],
      data: { marks: achievedMarks },
    });
  }

  // Insert if not exists
  const insert_data = await insertRecord(
    "daily_report",
    ["user_id", "activity_id", "count", "activity_date", "marks"],
    [user_id, activity_id, storedCount, final_activity_date, achievedMarks]
  );

  if (insert_data) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["Report added successfully!"],
      data: { marks: achievedMarks },
    });
  }

  return resp.json({ status: 0, code: 500, message: ["Failed to save report"] });
});

/**
 * Core "log/update one activity for one date" logic, extracted out of the
 * addSadhna route handler so it can be reused by other callers (e.g. the
 * SadhnaAssistant chatbot integration) without duplicating the marks
 * calculation. Returns the exact JSON body an Express handler would send.
 */
export const saveActivityEntry = async ({ activity_id, count, activity_date, user_id, unit }) => {
  const final_activity_date = moment(activity_date).format("YYYY-MM-DD");
  let storedCount = count;

  try {
    // 1. PARALLEL EXECUTION: Run initial checks & scheme assignment lookup concurrently
    const [
      checkResult,
      [[activityInfo]],
      [[studentAssignment]]
    ] = await Promise.all([
      db.execute(
        `SELECT dr.activity_id, dr.count, dr.note, dr.activity_date 
         FROM daily_report dr
         WHERE dr.activity_id = ? AND DATE(dr.activity_date) = ? AND dr.user_id = ? LIMIT 1`,
        [activity_id, final_activity_date, user_id]
      ),
      db.execute(
        `SELECT name, activity_type, master_activity_id FROM fix_activities WHERE activity_id = ? AND user_id = ? LIMIT 1`,
        [activity_id, user_id]
      ),
      db.execute(
        `SELECT ua.center_id, ua.label_id, ll.marking_scheme_id AS label_scheme_id, cl.marking_scheme_id AS center_scheme_id
         FROM user_assignments ua
         LEFT JOIN labels_list ll ON ua.label_id = ll.id
         LEFT JOIN center_list cl ON ua.center_id = cl.center_id
         WHERE ua.user_id = ? 
         ORDER BY ua.id DESC LIMIT 1`,
        [user_id]
      )
    ]);

    const check_today_sadhana = checkResult[0] && checkResult[0].length > 0 ? checkResult[0][0] : null;
    let achievedMarks = null;

    if (activityInfo) {
      if (activityInfo.activity_type === 'time') {
        storedCount = minutesToTime(Number(count));
      }
      const masterId = activityInfo.master_activity_id;

      if (masterId && Number(masterId) > 0) {
        // Resolve Scheme ID instantly from parallel joined result
        const schemeId = studentAssignment?.label_scheme_id 
          || studentAssignment?.center_scheme_id 
          || 1;

        // Fetch scoring rules for resolved scheme ID (with system default fallback)
        const [fetchedRules] = await db.execute(
          `SELECT condition_operator, condition_value, marks, scheme_id, frequency
           FROM marking_rules 
           WHERE scheme_id IN (?, 1)
             AND master_activity_id = ? 
             AND status = 1 
             AND frequency = 'daily'
           ORDER BY scheme_id = ? DESC`,
          [schemeId, masterId, schemeId]
        );

        if (fetchedRules.length > 0) {
          achievedMarks = calculateBestMarks(storedCount, fetchedRules, activityInfo.activity_type, unit);
        } else {
          achievedMarks = 0;
        }
      }
    }

    const currentDateIST = moment().utcOffset('+05:30').format("YYYY-MM-DD HH:mm:ss");

    if (check_today_sadhana) {
      // UPDATE existing entry
      await updateRecord(
        "daily_report",
        { count: storedCount, marks: achievedMarks, updated_at: currentDateIST },
        ["activity_id", "user_id", "activity_date"],
        [activity_id, user_id, final_activity_date],
      );

      // Async background summary update (non-blocking)
      await dailyStudentSummary(user_id, final_activity_date).catch(err =>
        console.error("Error updating daily student summary:", err)
      );

      return {
        status: 1,
        code: 200,
        message: ["Activity reset successfully!"],
        data: { marks: achievedMarks },
      };
    }

    // INSERT new entry
    const insert_data = await insertRecord(
      "daily_report",
      ["user_id", "activity_id", "count", "activity_date", "marks", "created_at", "updated_at"],
      [user_id, activity_id, storedCount, final_activity_date, achievedMarks, currentDateIST, currentDateIST],
    );

    if (insert_data) {
      // Async background summary update (non-blocking)
      dailyStudentSummary(user_id, final_activity_date).catch(err =>
        console.error("Error updating daily student summary:", err)
      );

      return {
        status: 1,
        code: 200,
        message: ["Report added successfully!"],
        data: { marks: achievedMarks },
      };
    }

    return { status: 0, code: 500, message: ["Failed to save report"] };

  } catch (err) {
    console.error("Error during saveActivityEntry execution:", err);
    return { status: 0, code: 500, message: ["Error saving sadhana report"] };
  }
};

export const addSadhna = asyncHandler(async (req, resp) => {
  const { activity_id, count, activity_date, user_id, unit } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    activity_id: ["required"],
    activity_date: ["required"],
    user_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const result = await saveActivityEntry({ activity_id, count, activity_date, user_id, unit });
  return resp.json(result);
});

export const editSadhna = asyncHandler(async (req, resp) => {
  const { activity_id, note, time } = req.body;
  const today_time = moment("Y-M-D h:i:s");
  const update_data = await db.execute(
    `UPDATE daily_report set note=? time=? where activity_id=?`,
    [note, time, activity_id],
  );
  if (update_data) {
    return resp.josn({
      status: 1,
      code: 200,
      message: ["report updated successfully!"],
    });
  }
});

export const activity_list = asyncHandler(async (req, resp) => {
  const { user_id } = req.body;
  const today_time = moment("Y-M-D h:i:s");
  const [[user_activity]] = await db.execute(
    `SELECT * FROM  user_activity where user_id=?`,
    [user_id],
  );

  if (user_activity) {
    return resp.josn({
      status: 1,
      code: 200,
      data: user_activity,
      message: ["report updated successfully!"],
    });
  }
});

export const addTemple = asyncHandler(async (req, resp) => {
  try {
    const request = req.body;
    const { user_id, temple_name } = request;
    const { isValid, errors } = validateFields(request, {
      user_id: ["required"],
      temple_name: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const insert_data = await insertRecord("temples", ["name"], [temple_name]);
    if (insert_data) {
      return resp.json({
        status: 1,
        code: 200,
        message: ["temple added successfully!"],
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
export const templeList = asyncHandler(async (req, resp) => {
  try {
    /*
        ifnull((select base_price from cycle_pricing cp where cp.station_id=cycle_list.station_id  and cp.type_of_cycle=cycle_list.cycle_type
             and cp.type_of_cycle=cycle_list.cycle_type ),0)as base_price
        */
    const { page_no = 1, search_text = "", rowSelected } = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
    });
    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const params = {
      tableName: "temples ",
      columns: `temple_id, name`,

      sortColumn: "id",
      sortOrder: "DESC",
      page_no,
      limit: rowSelected || 10,
      liveSearchFields: ["name"],
      liveSearchTexts: [search_text],
      whereField: ["status"],
      whereValue: [1],
      whereOperator: ["="],
    };

    const result = await getPaginatedData(params);

    return resp.json({
      status: 1,
      code: 200,
      message: ["temple list fetched successfully!"],
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

export const listCounsellor = asyncHandler(async (req, resp) => {
  const request = mergeParam(req);

  const { search_text, } = request;
  console.log("request", request);
  const { isValid, errors } = validateFields(request, {
    // temple_id: ["required"],
  });

  if (!isValid)
    return resp.json({
      status: 0,
      code: 422,
      message: errors,
    });

  // const [counsellor_list] = await db.execute(
  //   `SELECT user_id, name
  //        FROM users
  //        WHERE  user_type = ?
  //        AND name LIKE ?
  //        OR email LIKE ?
  //        AND status = 1`,
  //   [ "counsellor",search_text,search_text],
  // );
  const [counsellor_list] = await db.execute(
    `SELECT user_id, name
   FROM users
   WHERE user_type = ?
   AND status = 1
   AND (name LIKE ? OR email LIKE ?)`,
    ["counsellor", `%${search_text}%`, `%${search_text}%`],
  );

  if (!counsellor_list || counsellor_list.length === 0) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["No counsellor found for this temple"],
    });
  }

  return resp.json({
    status: 1,
    code: 200,
    data: counsellor_list,
    message: ["Counsellor list fetched successfully"],
  });
});
export const verifyCounsellor = asyncHandler(async (req, resp) => {
  const request = mergeParam(req);

  const { user_id, counsellor_id } = request;

  // Basic validation
  if (!counsellor_id) {
    return resp.json({
      status: 0,
      code: 422,
      message: ["counsellor_id is required"],
    });
  }

  // Check user exists
  const [rows] = await db.execute(
    `SELECT user_id, name, email 
     FROM users 
     WHERE user_id = ? 
     AND user_type = 'counsellor'
     AND status = 1`,
    [counsellor_id]
  );

  if (!rows || rows.length === 0) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["Counsllor Refral not applied"],
    });
  }

  return resp.json({
    status: 1,
    code: 200,
    data: rows[0],
    message: ["Counsellor verified successfully"],
  });
});
export const updateStudentDetails = asyncHandler(async (req, resp) => {
  const data = mergeParam(req);

  const { user_id, name, mobile, temple_id, counsller_id } = data;

  // ✅ Validation
  const { isValid, errors } = validateFields(data, {
    user_id: ["required"],
    name: ["required"],
    mobile: ["required"],
    temple_id: ["required"],
    counsller_id: ["required"],
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors,
    });
  }

  // ✅ Check user exist
  const [[user]] = await db.execute(
    `
        SELECT id FROM users WHERE user_id = ?
    `,
    [user_id],
  );

  if (!user) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["User not found"],
    });
  }

  // ✅ Update details
  await db.execute(
    `
        UPDATE users
        SET
        user_type = 'student',
        name = ?,
        mobile = ?,
        temple_id = ?,
        counsller_id = ?
        WHERE user_id = ?
    `,
    [name, mobile, temple_id, counsller_id, user_id],
  );

  return resp.json({
    status: 1,
    code: 200,
    message: ["Profile updated successfully"],

    data: {
      user_id,
      name,
      mobile,
      temple_id,
      counsller_id,
      user_type: "student",
    },
  });
});
export const addCounsellor = asyncHandler(async (req, resp) => {
  const { user_id, counsller_id } = mergeParam(req);
  console.log(mergeParam(req));
  /* ---------------------------
     VALIDATION
  ----------------------------*/
  const { isValid, errors } = validateFields(
    { user_id, counsller_id },
    {
      user_id: ["required"],
      counsller_id: ["required"],

    }
  );

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  /* ---------------------------
     CHECK USER EXISTS
  ----------------------------*/
  const [[user]] = await db.execute(
    `SELECT name,email,mobile,user_id FROM users WHERE user_id = ?`,
    [user_id]
  );

  if (!user) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["User not found"],
    });
  }

  /* ---------------------------
     CHECK COUNSELLOR EXISTS
  ----------------------------*/
  const [[counsellor]] = await db.execute(
    `SELECT email,name ,user_id FROM users WHERE user_id = ?`,
    [counsller_id]
  );

  if (!counsellor) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["Counsellor not found"],
    });
  }

  /* ---------------------------
     CHECK DUPLICATE ENTRY
  ----------------------------*/
  const [exists] = await db.execute(
    `
    SELECT id 
    FROM user_counsellors 
    WHERE user_id = ? AND counsller_id = ?
    `,
    [user_id, counsller_id]
  );

  if (exists.length) {
    return resp.json({
      status: 0,
      code: 409,
      message: ["Counsellor already assigned to this user"],
    });
  }

  /* ---------------------------
     INSERT
  ----------------------------*/

  const subject = "New Student Registration 🙏";
  const htmlContent = `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px;">
                        <h2 style="color: #0f172a; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">Hare Krsna, ${counsellor.name}!</h2>
                        <p style="font-size: 16px; color: #475569;">A new student has been added to your care on <strong>SadhanaGPT</strong>.</p>
                        
                        <div style="margin: 25px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #edf2f7;">
                            <p style="margin: 8px 0; color: #64748b;"><strong>Student Name:</strong> <span style="color: #0f172a;">${user.name}</span></p>
                            <p style="margin: 8px 0; color: #64748b;"><strong>Email:</strong> <span style="color: #0f172a;">${user.email}</span></p>
                            <p style="margin: 8px 0; color: #64748b;"><strong>Mobile:</strong> <span style="color: #0f172a;">${user.mobile}</span></p>
                        </div>
                        
                        <p style="font-size: 15px; color: #475569; line-height: 1.6;">Please guide them in their spiritual journey and help them establish a consistent sadhana practice.</p>
                        
                        <div style="margin-top: 30px;">
                            <a href="https://sadhanagpt.com/counsellor/dashboard" style="background:#1a73e8; color:white; padding:12px 24px; text-decoration:none; border-radius:8px; font-weight: bold; display:inline-block; box-shadow: 0 4px 6px -1px rgba(26, 115, 232, 0.2);">
                               Open Counsellor Dashboard
                            </a>
                        </div>
                        
                        <p style="margin-top: 35px; font-size: 12px; color: #94a3b8; border-top: 1px solid #eee; padding-top: 15px;">
                            Srila Prabhupada Ki Jaya!<br/>
                            SadhanaGPT Team
                        </p>
                    </div>
                `;
  emailQueue.addEmail(counsellor.email, subject, htmlContent);

  await insertRecord(
    "user_counsellors",
    ["user_id", "counsller_id"],
    [user_id, counsller_id]
  );
  return resp.json({
    status: 1,
    code: 200,
    message: ["Counsellor added successfully"],
  });
});

export const removeCounsellor = asyncHandler(async (req, resp) => {
  const { user_id, counsller_id } = mergeParam(req);

  const { isValid, errors } = validateFields(
    { user_id, counsller_id },
    {
      user_id: ["required"],
      counsller_id: ["required"],
    }
  );

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  await db.execute(
    `DELETE FROM user_counsellors WHERE user_id = ? AND counsller_id = ?`,
    [user_id, counsller_id]
  );

  return resp.json({
    status: 1,
    code: 200,
    message: ["Mentor removed successfully"],
  });
});


export const onBoarding = asyncHandler(async (req, resp) => {
  // here consler email will be ask form studnet ,
  const { name,email, mobile, temple_id,user_type, counsellor_id='', added_from = "",device_name = "",
    google_id='',
    profile,
    birthday,
    new_counsellor_email
  } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    email: ["required"],
    name: ["required"],
    mobile: ["required"],
    temple_id: user_type === "counsellor" ? ["required"] : [],
    user_type: ["required"],
    // google_id: ["required"],
    birthday: ["required"],
  });
  let final_temple_id, finally_counsller_id;

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors,
    });
  }

  // const isExist = await queryDB(
  //   `SELECT profile, access_token,user_id,email,mobile,temple_id,user_type, 
  //   (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id and 
  //   counsllor_type='primary' ) AS counsller_id FROM users WHERE 
  //   email = ?`,[email]);
  const isExist = await queryDB(
    `SELECT profile, access_token,user_id,email,mobile,temple_id,user_type, 
    (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id and counsllor_type='primary' ) AS counsller_id FROM users WHERE 
    email = ?`, [email]);
  const access_token = crypto.randomBytes(12).toString("hex");

  if (isExist) {
    // await updateRecord(
    //   "users",
    //   { profile },
    //   ["google_id"],
    //   [google_id],
    // );

    return resp.json({
      status: 1,
      code: 200,
      data: {
        user_id: isExist.user_id,
        email: isExist.email,
        name: isExist.name,
        mobile: isExist.mobile,
        access_token: isExist.access_token,
        temple_id: isExist.temple_id,
        user_type: isExist.user_type,
        counsller_id: isExist.counsller_id,
        profile: isExist.profile ? isExist.profile : process.env.IMAGE_UPLOAD_PATH + "default_profile.png",

      },
      message: ["User registred successfully"],
    });
  }
  switch (user_type) {
    case "student":
      // CASE 1: Student selected an existing counsellor from dropdown
      if (counsellor_id) {
        const counsellor = await queryDB(
          `SELECT temple_id FROM users WHERE user_id = ? limit 1`,
          [counsellor_id]
        );
        final_temple_id = counsellor.temple_id;
        finally_counsller_id = counsellor_id;
      }
      // CASE 2: Student typed a new counsellor email (not found in DB)
      else if (new_counsellor_email) {
        // First check if this email already exists (edge case: someone typed exact email of existing user)
        const existingCounsellor = await queryDB(
          `SELECT user_id, temple_id FROM users WHERE email = ? AND user_type = 'counsellor' LIMIT 1`,
          [new_counsellor_email]
        );

        if (existingCounsellor) {
          // Counsellor already exists with this email, just link them
          final_temple_id = existingCounsellor.temple_id;
          finally_counsller_id = existingCounsellor.user_id;
        } else {
          // Create a new placeholder counsellor
          const newCounsellorName = new_counsellor_email.split('@')[0]; // Use email prefix as temp name

          await db.execute(
            `INSERT INTO users (name, email, user_type, status) VALUES (?,  ?, 'counsellor', 1)`,
            [newCounsellorName, new_counsellor_email]
          );
          const newCounsellor = await queryDB(
            `SELECT user_id FROM users WHERE email = ? AND user_type = 'counsellor' LIMIT 1`,
            [new_counsellor_email]
          );


          final_temple_id = null; // New counsellor has no temple yet
          finally_counsller_id = newCounsellor.user_id;;
        }
      }
      // CASE 3: Neither provided
      else {
        return resp.json({
          status: 0,
          code: 422,
          message: ["Counsellor required for student"],
        });
      }
      break;
    case "counsellor":
      finally_counsller_id = null;
      final_temple_id = temple_id;
      break;
    default:
      return resp.json({
        status: 0,
        code: 422,
        message: ["Invalid user type"],
      });
  }

  const result = await registerUser(
    email,
    name,
    mobile,
    final_temple_id,
    user_type,
    finally_counsller_id,
    added_from,
    device_name,
    access_token,
    google_id,
    profile,
    birthday
  );
  return resp.json(result);
});

const registerUser = async (
  email,
  name,
  mobile,
  temple_id,
  user_type,
  counsller_id,
  added_from,
  device_name,
  access_token,
  google_id,
  profile,
  birthday
) => {
  const registration = await insertRecord(
    "users", [
    "email",
    "name",
    "mobile",
    "temple_id",
    "user_type",
    "status",
    "added_from",
    "device_name",
    "access_token",
    "google_id",
    "profile",
    "birthday"
  ],
    [
      email,
      name,
      mobile,
      temple_id,
      user_type,
      1,
      added_from,
      device_name,
      access_token,
      google_id,
      profile,
      birthday
    ],
  );

  if (registration.insertId > 0) {
    const user_id = "U" + String(registration.insertId).padStart(9, "0");
    console.log("user_id", user_id, "counsller_id", counsller_id);
    if (user_type === "student") {
      await insertRecord(
        "user_counsellors",
        ["user_id", "counsller_id", "counsllor_type"],
        [user_id, counsller_id, "primary"],
      );
    }

    await db.query(
      `INSERT INTO fix_activities 
   (user_id, master_activity_id, target, name, description, unit, activity_type, own_by)
   SELECT ?, a.id, a.target, a.name, a.description, a.unit, a.activity_type, 0
   FROM activities a
   WHERE  a.status = 1 AND NOT EXISTS (SELECT 1 FROM fix_activities f  WHERE f.user_id = ? AND f.name = a.name)`,
      [user_id, user_id]);

    if (user_type === "student" && counsller_id) {
      try {
        const [[counsellor]] = await db.execute(
          "SELECT name, email FROM users WHERE user_id = ?",
          [counsller_id]
        );
        if (counsellor) {
          const subject = "New Student Registration 🙏";
          const htmlContent = `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px;">
                        <h2 style="color: #0f172a; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">Hare Krsna, ${counsellor.name}!</h2>
                        <p style="font-size: 16px; color: #475569;">A new student has been added to your care on <strong>SadhanaGPT</strong>.</p>
                        
                        <div style="margin: 25px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #edf2f7;">
                            <p style="margin: 8px 0; color: #64748b;"><strong>Student Name:</strong> <span style="color: #0f172a;">${name}</span></p>
                            <p style="margin: 8px 0; color: #64748b;"><strong>Email:</strong> <span style="color: #0f172a;">${email}</span></p>
                            <p style="margin: 8px 0; color: #64748b;"><strong>Mobile:</strong> <span style="color: #0f172a;">${mobile}</span></p>
                        </div>
                        
                        <p style="font-size: 15px; color: #475569; line-height: 1.6;">Please guide them in their spiritual journey and help them establish a consistent sadhana practice.</p>
                        
                        <div style="margin-top: 30px;">
                            <a href="https://sadhanagpt.com/counsellor/dashboard" style="background:#1a73e8; color:white; padding:12px 24px; text-decoration:none; border-radius:8px; font-weight: bold; display:inline-block; box-shadow: 0 4px 6px -1px rgba(26, 115, 232, 0.2);">
                               Open Counsellor Dashboard
                            </a>
                        </div>
                        
                        <p style="margin-top: 35px; font-size: 12px; color: #94a3b8; border-top: 1px solid #eee; padding-top: 15px;">
                            Srila Prabhupada Ki Jaya!<br/>
                            SadhanaGPT Team
                        </p>
                    </div>
                `;
          emailQueue.addEmail(counsellor.email, subject, htmlContent);
        }
      } catch (err) {
        console.error("Counsellor notification failed:", err);
      }
    }

    return {
      message: ["successfully registered"],
      code: 200,
      status: 1,
      data: {
        user_id,
        email,
        name,
        mobile,
        temple_id,
        user_type,
        counsller_id,
        access_token
      },
    };
  }
};
export const olduserProfile = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);
  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
  const user = await queryDB(
    `SELECT user_id, name, email,mobile,temple_id,user_type,
         (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id LIMIT 1)
          AS counsller_id FROM 
          users WHERE user_id = ?`,
    [user_id],
  );

  if (!user) {
    return resp.json({
      status: 0,
      code: 404,

      message: ["User not found"],
    });
  }
  const rewards = await getUserRewards(user_id);
  return resp.json({
    status: 1,
    code: 200,
    data: { user, rewards },
    message: ["User data fetched successfully"],
  });

});
export const userProfile = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  const { isValid, errors } = validateFields({ user_id }, {
    user_id: ["required"],
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  /* ---------------------------
     FETCH USER
  ----------------------------*/
  const [users] = await db.execute(
    `
    SELECT
    
    u.reminder_enabled, 
    u.reminder_days,
    u.auto_report_status,
    u.report_frequency_days,
    u.top_ranker_from,
    u.top_ranker_to,
      u.user_id,
      u.name,
      u.email,
      u.mobile,
      u.profile,
      u.birthday as dob,
      u.temple_id,
    (SELECT cl.name 
       FROM user_assignments ua 
       INNER JOIN center_list cl ON cl.center_id = ua.center_id 
       WHERE ua.user_id = u.user_id LIMIT 1) as center_name,
      (SELECT ll.name 
       FROM user_assignments ua 
       INNER JOIN labels_list ll ON ll.id = ua.label_id 
       WHERE ua.user_id = u.user_id LIMIT 1) as label_name
    FROM users u
    WHERE u.user_id = ?
    `,
    [user_id]
  );

  if (!users.length) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["User not found"],
    });
  }

  const userData = users[0];

  /* ---------------------------
     FETCH MENTORS
  ----------------------------*/
  const [mentors] = await db.execute(
    `
    SELECT 
      uc.counsller_id AS mentor_id,
      usr.name,
      usr.email,
      usr.birthday AS dob,
      usr.auto_report_status,
      usr.report_frequency_days,
     
      usr.profile AS avatar
    FROM user_counsellors uc
    JOIN users usr ON uc.counsller_id = usr.user_id
   
    WHERE uc.user_id = ?
    `,
    [user_id]
  );
  // LEFT JOIN temples t ON usr.temple_id = t.temple_id
  /* ---------------------------
     FETCH REWARDS (your function)
  ----------------------------*/
  const rewards = await getUserRewards(user_id);

  /* ---------------------------
     FORMAT RESPONSE
  ----------------------------*/
  const response = {
    status: 1,
    code: 200,
    data: {
      user: {
        reminder_status: userData.reminder_enabled === 1 || userData.reminder_enabled === true ? 1 : 0,
        reminder_enabled: userData.reminder_enabled === 1 || userData.reminder_enabled === true ? 1 : 0,
        reminder_days: userData.reminder_days || 3,
        report_frequency_days: userData.report_frequency_days || 7,
        auto_report_status: userData.auto_report_status,
        top_ranker_from: userData.top_ranker_from,
        top_ranker_to: userData.top_ranker_to,
        name: userData.name,
        email: userData.email,
        mobile: userData.mobile,
        profile: userData.profile,
        dob: userData.dob,
        center_name: userData.center_name,
        label_name: userData.label_name
      },

      mentors: mentors.map((m) => ({
        mentor_id: m.mentor_id,
        mentor_name: m.name,
        mentor_email: m.email,
        mentor_dob: m.dob,
        temple: m.temple || "",
        mentor_profile_image: m.avatar,
        // Also keep old keys just in case other parts of the app use them
        name: m.name,
        email: m.email,
        dob: m.dob,
        avatar: m.avatar
      })),

      rewards: rewards || [],
    },
  };

  return resp.json(response);
});
export const editProfile = asyncHandler(async (req, resp) => {
  const { user_id, name, mobile, email, dob, birthday } = mergeParam(req);
  const dobVal = dob || birthday || null;

  /* ---------------------------
     VALIDATION
  ----------------------------*/
  const { isValid, errors } = validateFields(
    { user_id, name },
    {
      user_id: ["required"],
      name: ["required"],
    }
  );

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  /* ---------------------------
     CHECK USER EXISTS
  ----------------------------*/
  const [user] = await db.execute(
    `SELECT user_id FROM users WHERE user_id = ?`,
    [user_id]
  );

  if (!user.length) {
    return resp.json({
      status: 0,
      code: 404,
      message: ["User not found"],
    });
  }

  /* ---------------------------
     CHECK DUPLICATE EMAIL IF PROVIDED
  ----------------------------*/
  if (email) {
    const [emailCheck] = await db.execute(
      `SELECT user_id FROM users WHERE email = ? AND user_id != ?`,
      [email, user_id]
    );

    if (emailCheck.length) {
      return resp.json({
        status: 0,
        code: 409,
        message: ["Email address already in use"],
      });
    }
  }

  /* ---------------------------
     UPDATE PROFILE
  ----------------------------*/
  if (email) {
    await db.execute(
      `UPDATE users SET name = ?, mobile = ?, email = ?, birthday = ? WHERE user_id = ?`,
      [name, mobile || null, email, dobVal, user_id]
    );
  } else {
    await db.execute(
      `UPDATE users SET name = ?, mobile = ?, birthday = ? WHERE user_id = ?`,
      [name, mobile || null, dobVal, user_id]
    );
  }

  return resp.json({
    status: 1,
    code: 200,
    message: ["Profile updated successfully"],
  });
});
const getUserRewards = async (user_id) => {

  const [rows] = await db.execute(
    `SELECT fa.activity_id,r.reward_name,fa.name as activity_name,fa.activity_type,r.target_value,r.required_days, 
 count(dr.id) as completed_days, DATE_FORMAT(r.created_at, '%d-%m-%Y') as rewared_date from
    users u
    LEFT JOIN user_rewards ur on u.user_id=ur.user_id
    join reward_rules r on ur.reward_id=r.reward_id
    JOIN fix_activities fa on ur.activity_id=fa.activity_id
JOIN daily_report dr 
    ON dr.user_id = u.user_id 
    AND dr.activity_id = ur.activity_id
    where u.user_id=? 
    GROUP BY 
    ur.reward_id,
      fa.activity_id,
      r.reward_name,
      fa.name,
      fa.activity_type,
      r.target_value,
      r.required_days,
      r.created_at
    `,
    [user_id]
  );

  return rows;
}

export const UsernotificationList = asyncHandler(async (req, resp) => {
  // 1. Merge and Validate
  const params = mergeParam(req);
  const { user_id } = params;
  // Default page_no to 1 if missing or 0
  const page_no = parseInt(params.page_no) || 1;

  const { isValid, errors } = validateFields(params, {
    user_id: ["required"]
  });

  if (!isValid) {
    return resp.json({ status: 0, code: 422, message: errors });
  }

  // 2. Pagination Logic
  const limit = 10;
  const start = (page_no - 1) * limit;

  // 3. Count Total Notifications (Corrected params consistency)
  const [totalResult] = await db.execute(
    `SELECT COUNT(*) AS total FROM notifications WHERE panel_to = 'student' AND receive_id = ?`,
    [user_id]
  );
  const totalCount = totalResult[0]?.total || 0;
  const total_page = Math.ceil(totalCount / limit) || 1;

  // 4. Fetch Paginated Notifications
  const [rows] = await db.execute(
    `SELECT id, heading, description, module_name, panel_to, panel_from, receive_id, status, created_at, href
         FROM notifications 
         WHERE panel_to = 'student' AND receive_id = ? 
         ORDER BY id DESC 
         LIMIT ?, ?`,
    [user_id, String(start), String(limit)]
  );

  // 5. Mark notifications as read (Corrected 'rider_id' to 'user_id')
  // Doing this after fetching ensures we capture the current batch
  if (rows.length > 0) {
    await db.execute(
      `UPDATE notifications SET status = '1' 
             WHERE status = '0' AND panel_to = 'student' AND receive_id = ?`,
      [user_id]
    );
  }

  return resp.json({
    status: 1,
    code: 200,
    message: "Notification list fetched successfully",
    data: rows,
    total_page: total_page,
    totalRows: totalCount
  });
});


export const oldStudentActivitiesAnalytics = asyncHandler(async (req, res) => {
  const { user_id, start_date, end_date, filter = '7days' } = mergeParam(req);
  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],

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

    case "2days":
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment.clone().subtract(1, "days").format("YYYY-MM-DD");
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
      
      and DATE(dr.activity_date) BETWEEN ? AND ?
      order by dr.id ASC

      `,
    [user_id, start_date, end_date]
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
    WHEN fa.activity_type != 'time'
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
    AND DATE(dr.activity_date) BETWEEN ? AND ?
  JOIN users u ON u.user_id = ?
    WHERE
         fa.user_id = ? GROUP BY fa.activity_id
      `,
    [user_id, start_formatted_date, end_formatted_date, user_id, user_id]
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

export const StudentActivitiesAnalytics = asyncHandler(async (req, res) => {
  const { user_id, start_date, end_date, filter = "7days" } = mergeParam(req);

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });

  if (!isValid) {
    return res.json({ status: 0, code: 422, message: errors });
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
      start_formatted_date = today_moment
        .clone()
        .subtract(29, "days")
        .format("YYYY-MM-DD");
      break;

    case "custom":
      start_formatted_date = moment(start_date).format("YYYY-MM-DD");
      end_formatted_date = moment(end_date).format("YYYY-MM-DD");
      break;

    case "2days":
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment
        .clone()
        .subtract(1, "days")
        .format("YYYY-MM-DD");
      break;

    case "7days":
    default:
      end_formatted_date = today_moment.format("YYYY-MM-DD");
      start_formatted_date = today_moment
        .clone()
        .subtract(6, "days")
        .format("YYYY-MM-DD");
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
    [user_id, start_formatted_date, end_formatted_date]
  );

  /* ---------------------------
     GROUP DATA BY ACTIVITY
  ----------------------------*/
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
        WHEN fa.activity_type != 'time'
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
      AND DATE(dr.activity_date) BETWEEN ? AND ?
    WHERE fa.user_id = ?
    GROUP BY
    fa.activity_id,
      fa.name,
      fa.description,
      fa.unit,
      fa.activity_type
    `,
    [user_id, start_formatted_date, end_formatted_date, user_id]
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
    const last = daily_data[daily_data.length - 1]?.count || 0;
    const prev = daily_data[daily_data.length - 2]?.count || 0;

    let trend = "Stable";
    if (last > prev) trend = "+";
    else if (last < prev) trend = "-";

    /* -------- Calculate Accurate Average -------- */
    const validValues = daily_data.filter(d => {
      const v = d.count;
      if (typeof v === 'string' && v.includes(':')) return v !== '00:00:00' && v !== '00:00';
      return Number(v) > 0;
    });

    let avgValue = 0;
    if (validValues.length > 0) {
      if (activity.activity_type === "time") {
        let sumSin = 0;
        let sumCos = 0;

        validValues.forEach(d => {
          let mins = 0;
          const v = d.count;
          if (typeof v === 'number' || (typeof v === 'string' && !isNaN(v))) {
            mins = Number(v);
          } else if (typeof v === 'string') {
            let timeStr = v.toUpperCase().trim();
            const isPM = timeStr.includes('PM');
            const isAM = timeStr.includes('AM');
            timeStr = timeStr.replace('AM', '').replace('PM', '').trim();
            const parts = timeStr.split(':').map(Number);
            let h = parts[0] || 0;
            let m = parts[1] || 0;
            if (isPM && h < 12) h += 12;
            if (isAM && h === 12) h = 0;
            mins = h * 60 + m;
          }

          const angle = (mins / 1440) * 2 * Math.PI;
          sumSin += Math.sin(angle);
          sumCos += Math.cos(angle);
        });

        let avgAngle = Math.atan2(sumSin / validValues.length, sumCos / validValues.length);
        if (avgAngle < 0) avgAngle += 2 * Math.PI;

        const avgMins = Math.round((avgAngle / (2 * Math.PI)) * 1440) % 1440;
        let h = Math.floor(avgMins / 60);
        const m = avgMins % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // convert 0 to 12

        avgValue = `${h}:${String(m).padStart(2, '0')} ${period}`;
      } else {
        const total = validValues.reduce((sum, d) => sum + Number(d.count), 0);
        avgValue = total / daily_data.length;
        if (avgValue % 1 !== 0) avgValue = parseFloat(avgValue.toFixed(2));
      }
    }
    activity.average_value = avgValue;

    /* -------- Label Logic -------- */
    let label = "";
    if (activity.activity_type === "time") label = "Avg. Time";
    else if (activity.unit === "min") label = "Avg. Minutes";
    else if (activity.unit === "hours") label = "Avg. Hours";
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
      activities_analytics,
    },
  });
});

export const acontentListStudent = asyncHandler(async (req, resp) => {
  try {

    const {
      page_no = 1,
      user_id,
      search_text = "",
      rowSelected,
      content_type   // optional filter
    } = mergeParam(req);
    console.log("content_type", content_type)

    // ✅ Validation
    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
      user_id: ["required"]
    });

    if (!isValid) {
      return resp.json({ status: 0, code: 422, message: errors });
    }

    // ✅ Get student details (for filtering)
    const student = await queryDB(
      `SELECT user_id, name, center_id, label_id 
       FROM users 
       WHERE user_id = ?`,
      [user_id]
    );

    if (!student) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Student not found"]
      });
    }

    // ✅ Build dynamic WHERE conditions
    let whereConditions = `
      cg.group_id IS NULL OR 1=1
    `;

    let paramsArr = [];

    // 👉 Filter by center (via groups if needed)
    // (Optional: if group system mapped to center, else skip)

    // 👉 Filter by label
    if (student.label_id) {
      whereConditions += ` AND (cl.label_id = ? OR cl.label_id IS NULL)`;
      paramsArr.push(student.label_id);
    }

    // 👉 Filter by content type
    if (content_type) {
      whereConditions += ` AND c.content_type = ?`;
      paramsArr.push(content_type);
    }

    // 👉 Search
    if (search_text) {
      whereConditions += ` AND c.content LIKE ?`;
      paramsArr.push(`%${search_text}%`);
    }

    const limit = rowSelected || 10;
    const offset = (page_no - 1) * limit;

    // ✅ Main Query
    let query = `SELECT 
        c.id,
        c.content_type,
        c.content,
        c.created_at
      FROM contents c
      LEFT JOIN content_labels cl ON cl.content_id = c.id
      LEFT JOIN content_groups cg ON cg.content_id = c.id
      WHERE ${whereConditions}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`;
    console.log("query", query)
    const [data] = await db.execute(
      query,
      [...paramsArr, limit, offset]
    );

    // ✅ Count Query
    const [countResult] = await db.execute(
      `
      SELECT COUNT(DISTINCT c.id) as total
      FROM contents c
      LEFT JOIN content_labels cl ON cl.content_id = c.id
      LEFT JOIN content_groups cg ON cg.content_id = c.id
      WHERE ${whereConditions}
      `,
      paramsArr
    );

    const total = countResult[0]?.total || 0;
    const total_page = Math.ceil(total / limit);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Content list fetched successfully!"],
      student,
      data,
      total_page,
      total
    });

  } catch (error) {

    console.error("Error fetching content list:", error);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching content list"
    });
  }
});

export const contentListStudent = asyncHandler(async (req, resp) => {
  try {
    const {
      page_no = 1,
      user_id,
      search_text = "",
      content_type   // optional
    } = mergeParam(req);

    // ✅ 1. Validation
    const { isValid, errors } = validateFields(mergeParam(req), {
      page_no: ["required"],
      user_id: ["required"]
    });

    if (!isValid) {
      return resp.json({ status: 0, code: 422, message: errors });
    }

    // ✅ 2. Get student & their assignment details
    // We now fetch counsellor_id, center_id (which acts as group_id), and label_id
    const student = await queryDB(
      `SELECT u.user_id, u.name, ua.counsellor_id, ua.center_id, ua.label_id
       FROM users u
       LEFT JOIN user_assignments ua ON u.user_id = ua.user_id
       WHERE u.user_id = ?
       LIMIT 1`,
      [user_id]
    );

    if (!student) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["Student not found"]
      });
    }

    // ✅ 3. Build dynamic WHERE conditions
    let whereConditions = `1=1`;
    let paramsArr = [];

    // 👉 Filter by Counsellor: Content MUST belong to the student's assigned counsellor
    if (student.counsellor_id) {
      whereConditions += ` AND c.counsellor_id = ?`;
      paramsArr.push(student.counsellor_id);
    }

    // 👉 Filter by Group/Center: 
    // Content has NO groups targeted OR it specifically targets the student's center_id
    if (student.center_id) {
      whereConditions += ` AND (
        NOT EXISTS (SELECT 1 FROM content_groups cg WHERE cg.content_id = c.id)
        OR EXISTS (SELECT 1 FROM content_groups cg WHERE cg.content_id = c.id AND cg.group_id = ?)
      )`;
      paramsArr.push(student.center_id);
    } else {
      // If student has no center, they only see global content with no groups
      whereConditions += ` AND NOT EXISTS (SELECT 1 FROM content_groups cg WHERE cg.content_id = c.id)`;
    }

    // 👉 Filter by Label: 
    // Content has NO labels targeted OR it specifically targets the student's label_id
    if (student.label_id) {
      whereConditions += ` AND (
        NOT EXISTS (SELECT 1 FROM content_labels cl WHERE cl.content_id = c.id)
        OR EXISTS (SELECT 1 FROM content_labels cl WHERE cl.content_id = c.id AND cl.label_id = ?)
      )`;
      paramsArr.push(student.label_id);
    } else {
      // If student has no label, they only see content with no labels
      whereConditions += ` AND NOT EXISTS (SELECT 1 FROM content_labels cl WHERE cl.content_id = c.id)`;
    }

    // 👉 Content type filter
    if (content_type) {
      whereConditions += ` AND c.content_type = ?`;
      paramsArr.push(content_type);
    }

    // 👉 Search
    if (search_text) {
      whereConditions += ` AND c.content LIKE ?`;
      paramsArr.push(`%${search_text}%`);
    }

    // ✅ 4. Pagination
    const limit = 5;
    const offset = (page_no - 1) * limit;

    // ✅ 5. Main Query
    const query = `
      SELECT
        c.id,
        c.content_type,
        c.content,
        c.created_at
      FROM contents c
      WHERE ${whereConditions}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [data] = await db.query(
      query,
      [...paramsArr, parseInt(limit), parseInt(offset)]
    );

    // ✅ 6. Count Query
    const [countResult] = await db.query(
      `
      SELECT COUNT(c.id) as total
      FROM contents c
      WHERE ${whereConditions}
      `,
      paramsArr
    );

    const total = countResult[0]?.total || 0;
    const total_page = Math.ceil(total / limit);

    return resp.json({
      status: 1,
      code: 200,
      message: ["Content list fetched successfully!"],
      student,
      data,
      total_page,
      total,
    });

  } catch (error) {
    console.error("Error fetching content list:", error);

    return resp.status(500).json({
      status: 0,
      code: 500,
      message: "Error fetching content list"
    });
  }
});


export const NotinUsedownloadErrorLog = asyncHandler(async (req, resp) => {
  try {
    const logFile = path.join(process.cwd(), 'error.log');

    // Check if file exists
    if (!fs.existsSync(logFile)) {
      return resp.json({
        status: 0,
        code: 404,
        message: ["error.log file not found"]
      });
    }

    // Download file
    resp.setHeader('Content-Disposition', 'attachment; filename="error.log"');
    resp.setHeader('Content-Type', 'text/plain');

    const fileStream = fs.createReadStream(logFile);
    fileStream.pipe(resp);

  } catch (error) {
    console.error("Error downloading log file:", error);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Error downloading log file"]
    });
  }
});

export const submitAppFeedback = asyncHandler(async (req, resp) => {
  try {
    const { user_id, name, message } = req.body;

    // Basic Validation
    if (!user_id || !message || message.trim() === '') {
      return resp.json({
        status: 0,
        code: 422,
        message: ["user_id and message are required"]
      });
    }

    // Securely Insert to database including the new "name" column!
    const query = `INSERT INTO app_feedback (user_id, name, message, status) VALUES (?, ?, ?, 1)`;

    // We provide a fallback 'Unknown User' just to ensure it never crashes if the name fails to send
    const insertResult = await db.execute(query, [user_id, name || 'Unknown User', message.trim()]);

    if (insertResult) {
      // Fetch user details for email notification
      let userName = name || 'Unknown User';
      let userEmail = 'N/A';
      try {
        const [users] = await db.execute(`SELECT name, email FROM users WHERE user_id = ?`, [user_id]);
        if (users && users.length > 0) {
          if (users[0].name) userName = users[0].name;
          if (users[0].email) userEmail = users[0].email;
        }
      } catch (userErr) {
        console.error("Failed to fetch user details for feedback notification email:", userErr);
      }

      // Send Email Notification to paramjeetsinghwork7@gmail.com
      try {
        const emailSubject = `🔔 New App Feedback from ${userName}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px; background-color: #ffffff;">
            <div style="background-color: #f97316; padding: 16px; border-radius: 8px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 20px;">New App Feedback Received</h2>
            </div>
            <div style="padding: 20px 0; color: #1e293b;">
              <p style="margin: 6px 0;"><strong>Sender Name:</strong> ${userName}</p>
              <p style="margin: 6px 0;"><strong>Sender Email:</strong> ${userEmail}</p>
              <p style="margin: 6px 0;"><strong>User ID:</strong> ${user_id}</p>
              <p style="margin: 16px 0 6px 0;"><strong>Feedback Message:</strong></p>
              <div style="background-color: #f8fafc; border-left: 4px solid #f97316; padding: 14px; margin-top: 6px; border-radius: 4px; font-size: 15px; line-height: 1.5; color: #334155; white-space: pre-wrap;">${message.trim()}</div>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Sent automatically from SadhanaGPT App</p>
          </div>
        `;
        emailQueue.addEmail('paramjeetsinghwork7@gmail.com', emailSubject, emailHtml);
      } catch (mailErr) {
        console.error("Error enqueuing app feedback email:", mailErr);
      }

      return resp.json({
        status: 1,
        code: 200,
        message: ["Thank you! Your feedback has been received."],
        data: null
      });
    }

  } catch (err) {
    console.error("App Feedback Error:", err);
    return resp.status(500).json({
      status: 0,
      code: 500,
      message: ["Internal server error"]
    });
  }
});

export const uploadProfileImage = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  if (!user_id) {
    return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
  }

  if (!req.files || !req.files.profile || !req.files.profile.length) {
    return resp.json({ status: 0, code: 422, message: ["No profile image uploaded"] });
  }

  const fileUrl = req.files.profile[0].file_url;

  await db.execute(
    `UPDATE users SET profile = ? WHERE user_id = ?`,
    [fileUrl, user_id]
  );

  return resp.json({
    status: 1,
    code: 200,
    message: ["Profile image uploaded successfully"],
    data: {
      profile_image: fileUrl
    }
  });
});

export const removeProfileImage = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  if (!user_id) {
    return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
  }

  await db.execute(
    `UPDATE users SET profile = NULL WHERE user_id = ?`,
    [user_id]
  );

  return resp.json({
    status: 1,
    code: 200,
    message: ["Profile image removed successfully"],
    data: null
  });
});

export const calculateDailySadhanaScore = async (user_id, activity_date) => {
  const targetDateIST = activity_date
    ? moment(activity_date).format("YYYY-MM-DD")
    : moment().utcOffset('+05:30').format("YYYY-MM-DD");

  try {
    // 1. Determine student's center_id and label_id for custom rule precedence
    const [centerRows] = await db.execute(
      `SELECT center_id, label_id FROM user_assignments WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [user_id]
    );
    const center_id = centerRows.length > 0 && centerRows[0].center_id !== null ? centerRows[0].center_id : 0;
    const label_id = centerRows.length > 0 && centerRows[0].label_id !== null ? centerRows[0].label_id : 0;

    // Resolve the active marking scheme ID for this user (subgroup custom scheme precedence, then group custom scheme, fallback to default 1)
    let scheme_id = 1;
    if (label_id > 0) {
      const [labelDetail] = await db.query("SELECT marking_scheme_id FROM labels_list WHERE id = ?", [label_id]);
      if (labelDetail && labelDetail[0]?.marking_scheme_id) {
        scheme_id = labelDetail[0].marking_scheme_id;
      }
    }
    if (scheme_id === 1 && center_id > 0) {
      const [centerDetail] = await db.query("SELECT marking_scheme_id FROM center_list WHERE center_id = ?", [center_id]);
      if (centerDetail && centerDetail[0]?.marking_scheme_id) {
        scheme_id = centerDetail[0].marking_scheme_id;
      }
    }

    // 2. Get Max Possible Marks (Handles name-fallback and Center precedence in pure SQL using MAX)
    const [maxMarksResult] = await db.execute(`
      SELECT SUM(max_marks) as max_marks
      FROM (
        SELECT f.master_activity_id, 
               COALESCE(
                 (SELECT MAX(marks) FROM marking_rules WHERE master_activity_id = f.master_activity_id AND status = 1 AND frequency = 'daily' AND scheme_id = ?),
                 (SELECT MAX(marks) FROM marking_rules WHERE master_activity_id = f.master_activity_id AND status = 1 AND frequency = 'daily' AND scheme_id = 1)
               ) as max_marks
        FROM fix_activities f
        WHERE f.user_id = ? AND f.master_activity_id IS NOT NULL AND f.master_activity_id > 0
      ) temp
    `, [scheme_id, user_id]);

    // 3. Fetch Today's Total Earned Marks
    const [earnedMarksResult] = await db.execute(`
      SELECT SUM(marks) as earned_marks 
      FROM daily_report 
      WHERE user_id = ? AND DATE(activity_date) = ?
    `, [user_id, targetDateIST]);

    // 4. Calculate Percentage and Return
    const totalPossibleMarks = Number(maxMarksResult[0]?.max_marks) || 0;
    const totalEarnedMarks = Number(earnedMarksResult[0]?.earned_marks) || 0;

    let percentage = 0;
    if (totalPossibleMarks > 0) {
      percentage = Math.round((totalEarnedMarks / totalPossibleMarks) * 100);
      if (percentage > 100) percentage = 100;
    }

    console.log(`User: ${user_id}, Center: ${center_id}, Scheme: ${scheme_id}, Earned: ${totalEarnedMarks}, Max: ${totalPossibleMarks}, %: ${percentage}`);

    return { totalEarnedMarks, totalPossibleMarks, percentage };

  } catch (error) {
    console.error("Error calculating daily score:", error);
    return { totalEarnedMarks: 0, totalPossibleMarks: 0, percentage: 0 };
  }
};


export const getDailyScore = asyncHandler(async (req, resp) => {
  const { user_id, activity_date } = mergeParam(req);
  if (!user_id) {
    return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
  }

  try {
    const scoreData = await calculateDailySadhanaScore(user_id, activity_date);
    return resp.json({
      status: 1,
      code: 200,
      message: ["Daily score fetched successfully"],
      data: {
        earnedMarks: scoreData.totalEarnedMarks,
        maxMarks: scoreData.totalPossibleMarks,
        percentage: scoreData.percentage
      }
    });
  } catch (err) {
    console.error("Error fetching daily score:", err);
    return resp.json({
      status: 0,
      code: 500,
      message: ["Failed to calculate daily score"]
    });
  }
});

export const getWeeklyRanking = asyncHandler(async (req, resp) => {
  const { user_id, page_no = 1, limit = 10, center_filter = false, time_filter = 'today' } = mergeParam(req);
  
  if (!user_id) {
    return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
  }

  const offset = (Number(page_no) - 1) * Number(limit);
  
  const today = moment().format('YYYY-MM-DD');
  const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
  const sevenDaysAgo = moment().subtract(6, 'days').format('YYYY-MM-DD');

  try {
    let dateCondition = "dr.activity_date = ?";
    let dateParams = [today];

    if (time_filter === 'yesterday') {
      dateCondition = "dr.activity_date = ?";
      dateParams = [yesterday];
    } else if (time_filter === 'weekly') {
      dateCondition = "dr.activity_date BETWEEN ? AND ?";
      dateParams = [sevenDaysAgo, today];
    }

    let centerCondition = "";
    let centerId = null;

    if (String(center_filter) === 'true') {
      const [centerRows] = await db.execute(
        `SELECT center_id FROM user_assignments WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        [user_id]
      );
      if (centerRows.length > 0 && centerRows[0].center_id) {
        centerCondition = "AND ua.center_id = ?";
        centerId = centerRows[0].center_id;
      }
    }

    const mainParams = [...dateParams];
    if (centerId) mainParams.push(centerId);
    mainParams.push(String(limit), String(offset));

    const query = `
      SELECT 
        u.user_id, 
        u.name, 
        u.profile,
        SUM(dr.marks) as total_marks
      FROM users u
      JOIN daily_report dr ON u.user_id = dr.user_id
      LEFT JOIN user_assignments ua ON u.user_id = ua.user_id
      WHERE u.status = 1 
        AND ${dateCondition}
        ${centerCondition}
      GROUP BY u.user_id
      ORDER BY total_marks DESC, u.name ASC
      LIMIT ? OFFSET ?
    `;


    const [rankingList] = await db.execute(query, mainParams);

    // Get current user's specific rank
    let currentUserRank = null;
    if (rankingList.some(r => String(r.user_id) === String(user_id))) {
      currentUserRank = rankingList.findIndex(r => String(r.user_id) === String(user_id)) + 1 + offset;
    } else {
      // If not in this page, find their absolute rank
      const rankDateCondition = dateCondition.replace(/dr\./g, 'dr2.');
      const rankQuery = `
        SELECT user_rank FROM (
          SELECT dr2.user_id, RANK() OVER (ORDER BY SUM(dr2.marks) DESC) as user_rank
          FROM daily_report dr2
          LEFT JOIN user_assignments ua2 ON dr2.user_id = ua2.user_id
          WHERE ${rankDateCondition}
          ${centerCondition ? "AND ua2.center_id = ?" : ""}
          GROUP BY dr2.user_id
        ) sub
        WHERE user_id = ?
      `;
      const rankParams = [...dateParams];
      if (centerId) rankParams.push(centerId);
      rankParams.push(user_id);

      const [rankRes] = await db.execute(rankQuery, rankParams);
      if (rankRes.length > 0) currentUserRank = rankRes[0].user_rank;
    }

    // If user is #1 today, upsert top_ranker_from / top_ranker_to
    let topRankerDates = null;
    if (currentUserRank === 1 && time_filter === 'today') {
      const [existingRows] = await db.execute(
        `SELECT top_ranker_from, top_ranker_to FROM users WHERE user_id = ? LIMIT 1`,
        [user_id]
      );
      const existing = existingRows[0];
      if (!existing?.top_ranker_from) {
        // First time ever — set both from and to
        await db.execute(
          `UPDATE users SET top_ranker_from = ?, top_ranker_to = ? WHERE user_id = ?`,
          [today, today, user_id]
        );
        topRankerDates = { from: today, to: today };
      } else {
        // Already has a from date — just update to
        await db.execute(
          `UPDATE users SET top_ranker_to = ? WHERE user_id = ?`,
          [today, user_id]
        );
        topRankerDates = { from: existing.top_ranker_from, to: today };
      }
    }

    return resp.json({
      status: 1,
      code: 200,
      message: ["Ranking fetched successfully"],
      data: {
        ranking: rankingList,
        currentUserRank: currentUserRank,
        isTopRanker: currentUserRank === 1 && time_filter === 'today',
        topRankerDates: topRankerDates
      }
    });
  } catch (err) {
    console.error("Error fetching ranking:", err);
    return resp.json({ status: 0, code: 500, message: ["Failed to fetch ranking"] });
  }
});

export const getTopRankerBadge = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  if (!user_id) {
    return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
  }

  try {
    const [rows] = await db.execute(
      `SELECT top_ranker_from, top_ranker_to FROM users WHERE user_id = ? LIMIT 1`,
      [user_id]
    );

    if (!rows.length || !rows[0].top_ranker_from) {
      return resp.json({ status: 1, code: 200, data: { hasBadge: false } });
    }

    return resp.json({
      status: 1,
      code: 200,
      data: {
        hasBadge: true,
        from: rows[0].top_ranker_from,
        to: rows[0].top_ranker_to
      }
    });
  } catch (err) {
    console.error("Error fetching top ranker badge:", err);
    return resp.json({ status: 0, code: 500, message: ["Failed to fetch badge"] });
  }
});

export const getStudentAppliedMarkingScheme = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  if (!user_id) {
    return resp.json({ status: 0, code: 422, message: ["user_id is required"] });
  }

  try {
    // 1. Get student's assigned group (center_id) and subgroup (label_id)
    const [userAssigned] = await db.execute(
      `SELECT center_id, label_id FROM user_assignments WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [user_id]
    );
    const center_id = userAssigned[0]?.center_id || 0;
    const label_id = userAssigned[0]?.label_id || 0;

    // 2. Resolve active marking scheme ID (subgroup -> group -> default)
    let scheme_id = 1;
    let applied_level = 'System Default';

    if (label_id > 0) {
      const [labelRow] = await db.query(
        `SELECT marking_scheme_id, name FROM labels_list WHERE id = ?`,
        [label_id]
      );
      if (labelRow[0]?.marking_scheme_id) {
        scheme_id = labelRow[0].marking_scheme_id;
        applied_level = 'Subgroup Custom';
      }
    }

    if (scheme_id === 1 && center_id > 0) {
      const [centerRow] = await db.query(
        `SELECT marking_scheme_id, name FROM center_list WHERE center_id = ?`,
        [center_id]
      );
      if (centerRow[0]?.marking_scheme_id) {
        scheme_id = centerRow[0].marking_scheme_id;
        applied_level = 'Group Custom';
      }
    }

    // 3. Fetch Metadata (Scheme Name, Group Name, Subgroup Name)
    const [schemeInfo] = await db.query(`SELECT id, name FROM marking_schemes WHERE id = ?`, [scheme_id]);
    const [groupInfo] = await db.query(`SELECT name FROM center_list WHERE center_id = ?`, [center_id]);
    const [subgroupInfo] = await db.query(`SELECT name FROM labels_list WHERE id = ?`, [label_id]);

    // 4. Fetch Marking Rules for student's assigned activities with fallback to system rules (scheme_id = 1)
    const query = `
      SELECT 
        mr.id AS rule_id,
        mr.scheme_id,
        mr.master_activity_id,
        a.name AS activity_name,
        a.unit AS activity_unit,
        a.activity_type,
        mr.frequency,
        mr.condition_operator,
        mr.condition_value,
        mr.marks,
        mr.is_max_marks
      FROM fix_activities fa
      JOIN activities a ON fa.master_activity_id = a.id
      JOIN marking_rules mr ON fa.master_activity_id = mr.master_activity_id
      WHERE fa.user_id = ? 
        AND fa.master_activity_id IS NOT NULL
        AND mr.status = 1
        AND (
          mr.scheme_id = ? 
          OR (
            mr.scheme_id = 1 
            AND NOT EXISTS (
              SELECT 1 FROM marking_rules mr2 
              WHERE mr2.master_activity_id = fa.master_activity_id 
                AND mr2.scheme_id = ? 
                AND mr2.status = 1
            )
          )
        )
      ORDER BY fa.master_activity_id ASC, mr.marks DESC
    `;

    const [rules] = await db.execute(query, [user_id, scheme_id, scheme_id]);

    return resp.json({
      status: 1,
      code: 200,
      data: {
        scheme_id,
        scheme_name: schemeInfo[0]?.name || "System Default Rules",
        applied_level,
        group_name: groupInfo[0]?.name || null,
        subgroup_name: subgroupInfo[0]?.name || null,
        rules
      }
    });
  } catch (error) {
    console.error("Error fetching student applied marking scheme:", error);
    return resp.json({ status: 0, code: 500, message: ["Error fetching applied marking scheme"] });
  }
});

// --- WHATSAPP WEBHOOK MULTI-ACTIVITY LOGGING API ---
export const parseActivitiesString = (inputStr) => {
  if (!inputStr || typeof inputStr !== 'string') return [];
  const results = [];
  
  const lines = inputStr.split(/[\r\n;]+/).map(l => l.trim()).filter(Boolean);

  lines.forEach(line => {
    const parts = line.includes(':') || line.includes('=') || line.includes('-')
      ? line.split(/,(?=\s*[A-Za-z])/).map(p => p.trim()).filter(Boolean)
      : [line];

    parts.forEach(part => {
      const match = part.match(/^([^:=HTML_TAG_DELIMITER\-\s][^:=HTML_TAG_DELIMITER\-]*)\s*[:=\-]\s*(.+)$/i);
      if (match) {
        let key = match[1].trim();
        let val = match[2].trim();
        results.push({ key, val });
      } else {
        const spaceMatch = part.match(/^([A-Za-z\s]+)\s+([0-9:\sAMPMampm]+.*)$/);
        if (spaceMatch) {
          results.push({ key: spaceMatch[1].trim(), val: spaceMatch[2].trim() });
        }
      }
    });
  });

  return results;
};

export const whatsappWebhookActivityLog = asyncHandler(async (req, resp) => {
  const body = req.body || {};
  const query = req.query || {};

  // GET verification for WhatsApp/Meta Webhooks
  if (req.method === 'GET') {
    const hubMode = query['hub.mode'];
    const hubChallenge = query['hub.challenge'];
    if (hubMode === 'subscribe' && hubChallenge) {
      return resp.send(hubChallenge);
    }
    return resp.json({
      status: 1,
      code: 200,
      message: ["WhatsApp Webhook API active and ready."]
    });
  }

  // Extract mobile & activities string
  const mobile = body.mobile || body.mobile_number || body.phone || body.phone_number || body.from || body.sender || query.mobile || query.phone;
  const activitiesStr = body.activities || body.activities_string || body.message || body.text || body.body || body.content || body.data || query.activities || query.message;
  const rawDate = body.activity_date || body.date || query.activity_date || query.date;

  if (!mobile) {
    return resp.status(400).json({
      status: 0,
      code: 400,
      message: ["Mobile number (mobile/phone) is required."]
    });
  }

  if (!activitiesStr) {
    return resp.status(400).json({
      status: 0,
      code: 400,
      message: ["Activities string (activities/message/text) is required."]
    });
  }

  // Clean mobile & find student
  const cleanedDigits = String(mobile).replace(/[^0-9]/g, '');
  const last10Digits = cleanedDigits.slice(-10);

  const [[student]] = await db.execute(
    `SELECT user_id, name, mobile 
     FROM users 
     WHERE user_type != 'counsellor' 
       AND (mobile LIKE ? OR mobile LIKE ? OR REPLACE(REPLACE(mobile, ' ', ''), '+', '') LIKE ?) 
     LIMIT 1`,
    [`%${last10Digits}`, `%${cleanedDigits}`, `%${last10Digits}`]
  );

  if (!student) {
    return resp.status(404).json({
      status: 0,
      code: 404,
      message: [`Student not found for mobile number: ${mobile}`]
    });
  }

  const final_activity_date = rawDate ? moment(rawDate).format("YYYY-MM-DD") : moment().utcOffset('+05:30').format("YYYY-MM-DD");

  // Fetch student assignment for scheme resolution
  const [[studentAssignment]] = await db.execute(
    `SELECT ua.center_id, ua.label_id, ll.marking_scheme_id AS label_scheme_id, cl.marking_scheme_id AS center_scheme_id
     FROM user_assignments ua
     LEFT JOIN labels_list ll ON ua.label_id = ll.id
     LEFT JOIN center_list cl ON ua.center_id = cl.center_id
     WHERE ua.user_id = ? 
     ORDER BY ua.id DESC LIMIT 1`,
    [student.user_id]
  );

  const schemeId = studentAssignment?.label_scheme_id || studentAssignment?.center_scheme_id || 1;

  // Fetch available activities for student
  const [studentActivities] = await db.execute(
    `SELECT activity_id, name, activity_type, master_activity_id, unit, target 
     FROM fix_activities 
     WHERE user_id = ? OR own_by = 1 OR own_by = 0`,
    [student.user_id]
  );

  // Parse activities string into key-value pairs
  const parsedItems = parseActivitiesString(String(activitiesStr));

  if (parsedItems.length === 0) {
    return resp.status(400).json({
      status: 0,
      code: 400,
      message: ["Could not parse any activity key-value pairs from the string provided."]
    });
  }

  const loggedActivities = [];
  const ignoredActivities = [];
  const currentDateIST = moment().utcOffset('+05:30').format("YYYY-MM-DD HH:mm:ss");

  for (const item of parsedItems) {
    const rawKey = item.key.toLowerCase().trim();
    const rawVal = item.val.trim();

    // Match activity name
    let matchedAct = studentActivities.find(a => a.name.toLowerCase().trim() === rawKey);

    if (!matchedAct) {
      // Fuzzy/Partial match
      matchedAct = studentActivities.find(a => {
        const actName = a.name.toLowerCase().trim();
        return rawKey.includes(actName) || actName.includes(rawKey);
      });
    }

    if (!matchedAct) {
      ignoredActivities.push({ activity_name: item.key, raw_value: item.val, reason: "Activity not found" });
      continue;
    }

    // Process value
    let countVal = rawVal;
    const isTime = matchedAct.activity_type === 'time';
    const isYesNo = matchedAct.activity_type === 'yes_no' || matchedAct.activity_type === 'boolean';

    if (isYesNo) {
      const lower = rawVal.toLowerCase();
      if (lower === 'yes' || lower === 'true' || lower === 'y' || lower === 'attended' || lower === 'done' || lower === '1') {
        countVal = 1;
      } else if (lower === 'no' || lower === 'false' || lower === 'n' || lower === 'absent' || lower === '0') {
        countVal = 0;
      }
    } else if (isTime) {
      const mins = parseTimeToMinutes(rawVal);
      if (!isNaN(mins)) {
        countVal = minutesToTime(mins);
      }
    } else {
      const numMatch = rawVal.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        countVal = Number(numMatch[1]);
      }
    }

    // Evaluate marks
    let achievedMarks = null;
    if (matchedAct.master_activity_id && Number(matchedAct.master_activity_id) > 0) {
      const [fetchedRules] = await db.execute(
        `SELECT condition_operator, condition_value, marks, scheme_id, frequency
         FROM marking_rules 
         WHERE scheme_id IN (?, 1)
           AND master_activity_id = ? 
           AND status = 1 
           AND frequency = 'daily'
         ORDER BY scheme_id = ? DESC`,
        [schemeId, matchedAct.master_activity_id, schemeId]
      );

      if (fetchedRules.length > 0) {
        achievedMarks = calculateBestMarks(countVal, fetchedRules, matchedAct.activity_type, matchedAct.unit, matchedAct.name);
      } else {
        achievedMarks = 0;
      }
    }

    // Check if record exists for today
    const [[existingLog]] = await db.execute(
      `SELECT activity_id FROM daily_report WHERE activity_id = ? AND user_id = ? AND DATE(activity_date) = ? LIMIT 1`,
      [matchedAct.activity_id, student.user_id, final_activity_date]
    );

    if (existingLog) {
      await updateRecord(
        "daily_report",
        { count: countVal, marks: achievedMarks, updated_at: currentDateIST },
        ["activity_id", "user_id", "activity_date"],
        [matchedAct.activity_id, student.user_id, final_activity_date]
      );
    } else {
      await insertRecord(
        "daily_report",
        ["user_id", "activity_id", "count", "activity_date", "marks", "created_at", "updated_at"],
        [student.user_id, matchedAct.activity_id, countVal, final_activity_date, achievedMarks, currentDateIST, currentDateIST]
      );
    }

    loggedActivities.push({
      activity_id: matchedAct.activity_id,
      activity_name: matchedAct.name,
      value: countVal,
      marks: achievedMarks
    });
  }

  if (loggedActivities.length > 0) {
    dailyStudentSummary(student.user_id, final_activity_date).catch(err =>
      console.error("Error updating daily student summary from whatsapp webhook:", err)
    );
  }

  return resp.json({
    status: 1,
    code: 200,
    message: ["Activities logged successfully via WhatsApp webhook"],
    data: {
      student_id: student.user_id,
      student_name: student.name,
      mobile: student.mobile,
      activity_date: final_activity_date,
      logged_activities: loggedActivities,
      ignored_activities: ignoredActivities
    }
  });
});