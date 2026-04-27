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
      0,
      age,
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
export const addCounsller= asyncHandler(async (req, resp) => {
// type mentor email id, and then find 
const {studnet_id,counsler_email} = req.body;
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
    `UPDATE users SET access_token = ? WHERE email = ?`,
    [access_token, email],
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
    `UPDATE users SET access_token = ?, status = ? WHERE email = ?`,
    [token, 1, email],
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
  const { user_id, name, description='',target, unit,status, activity_type } = req.body;
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
    ["user_id", "name", "description", "unit", "activity_type","own_by","target"],
    [user_id, name, description, unit, activity_type,status,target],
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
  const { activity_id, user_id, target, name, description='', unit,status, activity_type } = req.body;
console.log("mergeParam(req)",mergeParam(req))
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
  const { activity_id, user_id } = req.body;
  console.log("deleteActivity req.body", req.body);

  const { isValid, errors } = validateFields(mergeParam(req), {
    activity_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
const delete_data = await db.execute(
  `DELETE FROM fix_activities 
   WHERE activity_id = ? AND user_id = ?`,
  [activity_id, user_id]
);
  if (delete_data) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["Activity deleted successfully!"],
    });
  }

  return resp.json({
    status: 0,
    code: 500,
    message: ["Failed to delete activity"],
  });
});

export const listActivities = asyncHandler(async (req, resp) => {
  const { user_id } = mergeParam(req);

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  
  const [all_activities] =
    await db.execute(`SELECT own_by as status,activity_id, name,description,unit,activity_type,target
        
         FROM fix_activities where user_id=?`,[user_id]);//

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

    const response = {
      user_id,
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
function minutesToTime(mins) {
  const hrs = Math.floor(mins / 60);
  const minsPart = mins % 60;
  const period = hrs >= 12 ? 'PM' : 'AM';
  const hour12 = hrs % 12 === 0 ? 12 : hrs % 12;
  return `${hour12}:${String(minsPart).padStart(2, '0')} ${period}`;
}

export const addSadhna = asyncHandler(async (req, resp) => {

  const { activity_id, count, activity_date, note, user_id, unit } = req.body;
  
  const { isValid, errors } = validateFields(req.body, {
    activity_id: ["required"],
    activity_date: ["required"],
    count: ["required"],
    user_id: ["required"],
    // unit: ["required"],
  });
  
  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
  const today = moment().format("YYYY-MM-DD");
  const final_activity_date = moment(activity_date).format("YYYY-MM-DD");
  const check_today_sadhana = await queryDB(
    `SELECT fa.activity_type, dr.activity_id,dr.note,dr.activity_date,dr.count from daily_report dr
    JOIN fix_activities fa ON  fa.activity_id=dr.activity_id 
    where
         dr.activity_id=? and DATE(dr.activity_date)=? `,
    [activity_id, final_activity_date],
  );
  const isTime = check_today_sadhana?.activity_type === 'time';

const storedCount = isTime ? minutesToTime(Number(count)) : count;
  if (check_today_sadhana) {
    
    await updateRecord(
      "daily_report",
      { count: storedCount },
      ["activity_id","user_id","activity_date"],
      [activity_id,user_id,final_activity_date],
    );
        console.log("updated")
    return resp.json({
      status: 0,
      code: 200,
      message: ["updated activity!"],
      data: {  },
    });
  }

  const insert_data = await insertRecord(
    "daily_report",
    ["user_id", "activity_id", "count",  "activity_date"],
    [user_id, activity_id,  storedCount,final_activity_date],
  );

  if (insert_data) {
    console.log("inserted")
    
    return resp.json({
      status: 1,
      code: 200,
      message: ["Report added successfully!"],
      data: { },
    });
  }
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

  const { user_id,counsellor_id } = request;

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
     CHECK COUNSELLOR EXISTS
  ----------------------------*/
  const [counsellor] = await db.execute(
    `SELECT user_id FROM users WHERE user_id = ?`,
    [counsller_id]
  );

  if (!counsellor.length) {
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

export const oldonBoarding = asyncHandler(async (req, resp) => {
  // here consler email will be ask form studnet ,
  const { name,email, mobile, temple_id,user_type, counsellor_id='U000000002', added_from = "",device_name = "",
    google_id,
    profile,
    birthday
  } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    email: ["required"],
    name: ["required"],
    mobile: ["required"],
    temple_id: user_type === "counsellor" ? ["required"] : [],
    user_type: ["required"],
    google_id: ["required"],
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

  const isExist = await queryDB(
    `SELECT profile, access_token,user_id,email,mobile,temple_id,user_type, (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id) AS counsller_id FROM users WHERE google_id = ?`,
    [google_id],
  );
  const access_token = crypto.randomBytes(12).toString("hex");

  if (isExist) {
    await updateRecord(
      "users",
      { access_token, profile },
      ["google_id"],
      [google_id],
    );

    return resp.json({
      status: 1,
      code: 200,
      data: {
        user_id:isExist.user_id,
        email: isExist.email,
        name: isExist.name,
        mobile: isExist.mobile,
        access_token: isExist.access_token,
        temple_id: isExist.temple_id,
        user_type: isExist.user_type,
        counsller_id: isExist.counsller_id,
        profile:isExist.profile ? isExist.profile : process.env.IMAGE_UPLOAD_PATH + "default_profile.png",
      
      },
      message: ["User registred successfully"],
    });
  }
  switch (user_type) {
    case "student":
     
      if (!counsellor_id) {
        return resp.json({
          status: 0,
          code: 422,
          message: ["Counsellor  required for student"],
        });
      }
      const counsellor = await queryDB(
        `SELECT 
        temple_id FROM users WHERE user_id = ?  limit 1`,
        [counsellor_id],
      );
      final_temple_id = counsellor.temple_id;
      finally_counsller_id = counsellor_id;

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
export const onBoarding = asyncHandler(async (req, resp) => {
  // here consler email will be ask form studnet ,
  const { name,email, mobile, temple_id,user_type, counsellor_id='U000000002', added_from = "",device_name = "",
    google_id,
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
    google_id: ["required"],
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

  const isExist = await queryDB(
    `SELECT profile, access_token,user_id,email,mobile,temple_id,user_type, (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id) AS counsller_id FROM users WHERE google_id = ?`,
    [google_id],
  );
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
        user_id:isExist.user_id,
        email: isExist.email,
        name: isExist.name,
        mobile: isExist.mobile,
        access_token: isExist.access_token,
        temple_id: isExist.temple_id,
        user_type: isExist.user_type,
        counsller_id: isExist.counsller_id,
        profile:isExist.profile ? isExist.profile : process.env.IMAGE_UPLOAD_PATH + "default_profile.png",
      
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
        [newCounsellorName,new_counsellor_email]
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
    "users",[
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
        ["user_id", "counsller_id","counsllor_type"],
        [user_id, counsller_id,"primary"],
      );
    }

   await db.query(
  `INSERT INTO fix_activities 
   (user_id,target, name, description, unit, activity_type, own_by)
   SELECT ?,a.target, a.name, a.description, a.unit, a.activity_type, 0
   FROM activities a
   WHERE  a.status = 1 AND NOT EXISTS (SELECT 1 FROM fix_activities f  WHERE f.user_id = ? AND f.name = a.name)`,
   [user_id, user_id]);

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
  const { user_id} = mergeParam(req);
  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
     });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
     const user= await queryDB(
        `SELECT user_id, name, email,mobile,temple_id,user_type,
         (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id)
          AS counsller_id FROM 
          users WHERE user_id = ?`,
        [user_id],
      );

    if(!user){
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
    data: {user,rewards},
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
    u.auto_report_status,
    u.report_frequency_days,
      u.user_id,
      u.name,
      u.email,
      u.mobile,
      u.profile,
      u.temple_id
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
        auto_report_status:userData.auto_report_status,
        report_frequency_days: userData.report_frequency_days ,
        name: userData.name,
        email: userData.email,
        mobile: userData.mobile,
        profile: userData.profile,
      },

      mentors: mentors.map((m) => ({
        mentor_id: m.mentor_id,
        name: m.name,
        temple: m.temple || "",
        avatar: m.avatar,
      })),

      rewards: rewards || [],
    },
  };

  return resp.json(response);
});
export const editProfile = asyncHandler(async (req, resp) => {
  const { user_id, name, mobile } = mergeParam(req);

  /* ---------------------------
     VALIDATION
  ----------------------------*/
  const { isValid, errors } = validateFields(
    { user_id, name, mobile },
    {
      user_id: ["required"],
      name: ["required"],
      mobile: ["required"],
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
     OPTIONAL: CHECK DUPLICATE MOBILE
  ----------------------------*/
  const [mobileCheck] = await db.execute(
    `SELECT user_id FROM users WHERE mobile = ? AND user_id != ?`,
    [mobile, user_id]
  );

  if (mobileCheck.length) {
    return resp.json({
      status: 0,
      code: 409,
      message: ["Mobile number already in use"],
    });
  }

  /* ---------------------------
     UPDATE PROFILE
  ----------------------------*/
  await db.execute(
    `
    UPDATE users 
    SET name = ?, mobile = ?
    WHERE user_id = ?
    `,
    [name, mobile, user_id]
  );

  /* ---------------------------
     FETCH UPDATED USER
  ----------------------------*/
  
  
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


export const oldStudentActivitiesAnalytics = asyncHandler(async (req,res)=>{
 const {  user_id,start_date,end_date,filter='7days'    } = mergeParam(req);
     const { isValid, errors } = validateFields(mergeParam(req), {
      user_id: ["required"],
     
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
      
      and DATE(dr.activity_date) BETWEEN ? AND ?
      order by dr.id ASC

      `,
      [user_id,start_date,end_date]
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
         fa.user_id = ? GROUP BY fa.activity_id
      `,
      [user_id,user_id,user_id]
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
    [user_id, user_id]
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

    /* -------- Label Logic -------- */
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
    console.log("content_type",content_type)

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
   let query=`SELECT 
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
      console.log("query",query)
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