import { configDotenv } from "dotenv";
import bcrypt from "bcrypt";

import crypto from "crypto";

import {
  asyncHandler,
  checkNumber,
  generateOTP,
  mergeParam,
} from "@sadhna/utils/utils.js";
import validateFields from "@sadhna/utils/validation.js";
import {
  deleteRecord,
  getPaginatedData,
  insertRecord,
  queryDB,
  updateRecord,
} from "@sadhna/utils/dbUtils.js";
import moment from "moment";
import db from "../../../config/database.js";
import emailQueue from "@sadhna/utils/emails/emailQueue.js";

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
  console.log("db.execute type:", typeof db.execute);

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
    student_id: user_id,
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

  const rider = queryDB(
    `SELECT EXISTS (SELECT 1 FROM users WHERE user_id = ?) AS rider_exists`,
    [user_id],
  );
  if (!rider)
    return resp.json({ status: 0, code: 400, message: "user ID Invalid!" });

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
  const { user_id, name, description, unit, activity_type } = req.body;
  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
    name: ["required"],
    // description: ["required"],
    unit: ["required"],
    activity_type: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const insert_data = await insertRecord(
    "fix_activities",
    ["user_id", "name", "description", "unit", "activity_type"],
    [user_id, name, description, unit, activity_type],
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
  const { activity_id, user_id, name, description, unit, activity_type } = req.body;

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
    ["name", "description", "unit", "activity_type"],
    [name, description, unit, activity_type],
    "activity_id",
    activity_id
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

  const { isValid, errors } = validateFields(mergeParam(req), {
    activity_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  const delete_data = await db.excute(`DELETE FROM fix_activities
     where  own_by=0 andactivity_id=? and user_id=? `,[activity_id,user_id]) //("fix_activities", "id", activity_id);

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
  const { user_id } = req.body;

  const { isValid, errors } = validateFields(mergeParam(req), {
    user_id: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

  
  const [all_activities] =
    await db.execute(`SELECT activity_id, name,description,unit,activity_type
        
         FROM fix_activities where own_by=1 OR user_id=?`,[user_id]);

  // if (activities && activities.length=== 0) {
  // return resp.json({ status: 0, code: 404, message: ['No activities found for this user'] });
  // }

  const data = {
    all_activities,
  };
  return resp.json({ status: 1, code: 200, data });
});
export const todayReportlist = asyncHandler(async (req, resp) => {
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
       JOIN activities a on r.activity_id=a.id
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

export const addSadhna = asyncHandler(async (req, resp) => {
  const { activity_id, count, activity_date, note, user_id, unit } = req.body;
  const { isValid, errors } = validateFields(req.body, {
    activity_id: ["required"],
    activity_date: ["required"],
    count: ["required"],
    user_id: ["required"],
    unit: ["required"],
  });

  if (!isValid) return resp.json({ status: 0, code: 422, message: errors });
  const today = moment().format("YYYY-MM-DD");
  const final_activity_date = moment(activity_date).format("YYYY-MM-DD");
  const check_today_sadhana = await queryDB(
    `SELECT activity_id,unit ,note,activity_date,count from daily_report where
         activity_id=? and DATE(activity_date)=? `,
    [activity_id, final_activity_date],
  );

  if (check_today_sadhana) {
    const [[report]] = await db.execute(
      `SELECT activity_id,unit ,note, activity_date,count from daily_report where
          DATE(activity_date)=? and user_id=? and activity_id=?`,
      [today, user_id, activity_id],
    );

    updateRecord(
      "daily_report",
      { count, note, unit },
      ["id"],
      [check_today_sadhana.id],
    );
    return resp.json({
      status: 0,
      code: 200,
      message: ["updated activity!"],
      data: { today_report: report },
    });
  }

  const insert_data = await insertRecord(
    "daily_report",
    ["user_id", "activity_id", "note", "count", "unit", "activity_date"],
    [user_id, activity_id, note, count, unit, final_activity_date],
  );

  if (insert_data) {
    const [[report]] = await db.execute(
      `SELECT activity_id,unit ,note, activity_date,count from daily_report where
          DATE(activity_date)=? and user_id=? and activity_id=?`,
      [today, user_id, activity_id],
    );
    return resp.json({
      status: 1,
      code: 200,
      message: ["Report added successfully!"],
      data: { today_report: report },
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

  const { temple_id } = request;

  const { isValid, errors } = validateFields(request, {
    temple_id: ["required"],
  });

  if (!isValid)
    return resp.json({
      status: 0,
      code: 422,
      message: errors,
    });

  const [counsellor_list] = await db.execute(
    `SELECT user_id, name
         FROM users
         WHERE temple_id = ?
         AND user_type = ?
         AND status = 1`,
    [temple_id, "counsellor"],
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

export const registerStudentEmailOnly = asyncHandler(async (req, resp) => {
  const data = mergeParam(req);

  const { email } = data;

  const { isValid, errors } = validateFields(data, {
    email: ["required"],
  });

  if (!isValid) {
    return resp.json({
      status: 0,
      code: 422,
      message: errors,
    });
  }

  //  Check email already exists
  const [[isExist]] = await db.execute(
    `
        SELECT user_id, email FROM users WHERE email = ?
    `,
    [email],
  );

  if (isExist) {
    return resp.json({
      status: 1,
      code: 200,
      message: ["User already exists"],
    });
  }

  // Insert new user (trigger will create user_id)
  await db.execute(
    `
        INSERT INTO users
        (
            email,
            status
        )
        VALUES (?, ?)
    `,
    [email, 1],
  );

  //  Fetch again to get trigger generated user_id
  const [[newUser]] = await db.execute(
    `
        SELECT user_id, email FROM users WHERE email = ?
    `,
    [email],
  );

  return resp.json({
    status: 1,
    code: 200,
    message: ["Student registered successfully"],

    data: {
      user_id: newUser.user_id,
      email: newUser.email,
    },
  });
});

export const onBoarding = asyncHandler(async (req, resp) => {
  const {
    name,
    email,
    mobile,
    temple_id,
    user_type,
    counsellor_id,
    added_from = "",
    device_name = "",
    google_id,
    profile,
  } = req.body;

  const { isValid, errors } = validateFields(req.body, {
    email: ["required"],
    name: ["required"],
    mobile: ["required"],
    temple_id: user_type === "counsellor" ? ["required"] : [],
    user_type: ["required"],
    google_id: ["required"],
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
    `SELECT profile, user_id,email,mobile,temple_id,user_type, (SELECT counsller_id FROM user_counsellors WHERE user_id = users.user_id) AS counsller_id FROM users WHERE google_id = ?`,
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
          message: ["Counsellor ID required for student"],
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
) => {
  const registration = await insertRecord(
    "users",
    [
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
      "profile"
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
    ],
  );

  if (registration.insertId > 0) {
    const user_id = "U" + String(registration.insertId).padStart(9, "0");
    console.log("user_id", user_id, "counsller_id", counsller_id);
    if (user_type === "student") {
      await insertRecord(
        "user_counsellors",
        ["user_id", "counsller_id"],
        [user_id, counsller_id],
      );
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
      },
    };
  }
};
export const userData = asyncHandler(async (req, resp) => {
  const { user_id} = req.body;
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
    GROUP BY ur.reward_id
    `,
    [user_id]
  );

  return rows;
}

export const UsernotificationList = asyncHandler(async (req, resp) => {
    const { user_id, page_no} = mergeParam(req);

    const { isValid, errors } = validateFields(mergeParam(req), {
        user_id: ["required"], page_no: ["required"],
    });

    if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

    const limit = 10;
    const start = parseInt((page_no * limit) - limit, 10);

    const totalRows = await queryDB(`SELECT COUNT(*) AS total FROM notifications WHERE   panel_to = ? AND receive_id = ?`, ['student', user_id]);
    const total_page = Math.ceil(totalRows.total / limit) || 1; 
    
    const [rows] = await db.execute(`SELECT id, heading, description, module_name, panel_to, panel_from, receive_id, status, ${formatDateTimeInQuery(['created_at'])}, href
        FROM notifications WHERE  panel_to = 'Rider' AND receive_id = ? ORDER BY id DESC LIMIT ${start}, ${parseInt(limit)} 
    `, [user_id]);
    
    const notifications = rows;
    
    await db.execute(`UPDATE notifications SET status=? WHERE  status=? AND panel_to=? AND receive_id=?`, ['1', '0', 'student', rider_id]);
    
    return resp.json({status:1, code: 200, message: "Notification list fetch successfully", data: notifications, total_page: total_page, totalRows: totalRows.total});
});