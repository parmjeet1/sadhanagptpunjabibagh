import db from "../../config/database.js";
import EmailQueue from '../../utils/emails/emailQueue.js';

import { asyncHandler, mergeParam } from "../../utils/utils.js";
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import validateFields from '../../utils/validation.js';
import { generateOTP,saveOtp, verifyOtp } from '../../utils/utils.js';
import emailQueue from '../../utils/emails/emailQueue.js';
import { queryDB } from "../../utils/dbUtils.js";
import path from 'path';
import fs from 'fs';
export const Register=(req,resp)=>{
const{name, }=mergeParam(req)
   
    return resp.json({
        status:1,
        code:200,
        message:['success']

    })

}

export const sendEmailOtp = asyncHandler(async (req, res) => {
  const { email } = mergeParam(req);
  // Validation
console.log("Received email for OTP:", email);
  const { isValid, errors } = validateFields({ email }, { email: ['required', 'email'] });
  if (!isValid) {
    return res.json({ status: 0, code: 422, message: errors });
  }
    const [[user]] = await db.execute(`SELECT name 
        FROM users WHERE email = ?
        `, [email],);

    if (!user) {
        return resp.json({
        status: 0,
        code: 404,
        message: ["User not found"],
        });
    }


  // Generate 6-digit OTP
  const otp = generateOTP(6);
  console.log(`Generated OTP for ${email}:`, otp); // Log OTP for debugging (remove in production)
  // Send via existing EmailQueue
  const subject = 'Hare Krishna - Your SadhanaGPT Login OTP';
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; background-color: #fffaf0; border: 2px solid #ff9933; border-radius: 15px; max-width: 500px; margin: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #e65c00; margin: 0; font-size: 28px;">Hare Krishna!</h1>
            <p style="color: #8b4513; font-style: italic; margin-top: 5px;">"Chant Hare Krishna and be happy"</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <p style="color: #333; font-size: 16px; margin-bottom: 20px;">Please use the following OTP to continue your <b>Sadhana</b> progress on SadhanaGPT:</p>
            
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #d35400; padding: 15px; border: 1px dashed #ff9933; display: inline-block; border-radius: 8px; background: #fff9f0;">
                ${otp}
            </div>
            
            <p style="color: #666; font-size: 13px; margin-top: 25px;">This code will remain valid for <b>5 minutes</b>.</p>
        </div>
        <div style="margin-top: 25px; text-align: center; color: #8b4513;">
            <p style="margin: 5px 0; font-weight: bold;">Srila Prabhupada Ki Jaya!</p>
            <p style="font-size: 12px; color: #a0522d; margin-top: 15px;">
                Your servants,<br>
                <b>SadhanaGPT Team</b>
            </p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #ffcc99; margin: 20px 0;">
        <p style="font-size: 11px; color: #bc8f8f; text-align: center;">
            If you did not request this login, please ignore this message.
        </p>
    </div>
  `;

  EmailQueue.addEmail(email, subject, html);
  // Save to memory
  saveOtp(email, otp);
  return res.json({
    status: 1,
    code: 200,
    message: 'OTP sent successfully to your email.',
  });
});

export const oldverifyEmailOtp = asyncHandler(async (req, res) => {
  const { email, otp } = mergeParam(req);
  // Validation
  const { isValid, errors } = validateFields({ email, otp }, {
    email: ['required', 'email'],
    otp:   ['required'],
  });
  if (!isValid) {
    return res.json({ status: 0, code: 422, message: errors });
  }
  // Verify
  if (!verifyOtp(email, otp)) {
    return res.json({
      status: 0,
      code: 401,
      message: 'Invalid or expired OTP.',
    });
  }
  // Check/Create User in DB
  const [rows] = await db.execute(
    `SELECT user_id, name, email, user_type FROM users WHERE email = ?`,
    [email]
  );
  let user;
  if (rows.length) {
    user = rows[0];
  } else {
    // New user auto-registration
    const [result] = await db.execute(
      `INSERT INTO users (email, name, user_type) VALUES (?, ?, ?)`,
      [email, email.split('@')[0], 'student']
    );
    user = {
      user_id: result.insertId,
      name:    email.split('@')[0],
      email,
      user_type: 'student',
    };
  }
  // Format response details
  const userDetails = {
    user_id: user.user_id,
    name:    user.name,
    email:   user.email,
    user_type: user.user_type,
    access_token: crypto.randomBytes(24).toString('hex'), // Create a session token
  };
  // Optional: Update token in DB if your system tracks it
  await db.execute('UPDATE users SET access_token = ? WHERE user_id = ?', [userDetails.access_token, user.user_id]);
  return res.json({
    status: 1,
    code: 200,
    message: 'Login successful.',
    data: userDetails,
  });
});

export const verifyEmailOtp = asyncHandler(async (req, res) => {
  const { email, otp } = mergeParam(req);
  // Validation
  const { isValid, errors } = validateFields({ email, otp }, {
    email: ['required', 'email'],
    otp:   ['required'],
  });
  if (!isValid) {
    return res.json({ status: 0, code: 422, message: errors });
  }
  // 1. Check OTP memory
  if (!verifyOtp(email, otp)) {
    return res.json({
      status: 0,
      code: 401,
      message: 'Invalid or expired OTP.',
    });
  }
  // 2. Fetch User Details (using your specific query)
  const user_check = await queryDB(
    `SELECT u.access_token, u.user_id, u.name, u.email, u.user_type, 
    uc.counsller_id as primary_counsller_id FROM users u
    LEFT JOIN user_counsellors uc on u.user_id = uc.user_id AND uc.counsllor_type='primary'
    WHERE u.email = ? `,
    [email]
  );
  let responseData = {};
 
  if (user_check) {
    // Existing user found
    responseData = {
      status: "existing_user",
      user_id: user_check.user_id,
      name: user_check.name,
      email: user_check.email,
      user_type: user_check.user_type,
      counsller_id: user_check.primary_counsller_id, // Map the join result
      access_token: user_check.access_token
    };
    return res.json({
      status: 1,
      code: 200,
      message: 'Login successful.',
      data: responseData
    });
  } else {
    // This case shouldn't hit due to sendEmailOtp check, but kept for safety
    return res.json({
      status: 0,
      code: 404,
      message: ["User not found after verification."],
    });
  }
});
export const downloadErrorLog = asyncHandler(async (req, res) => {
    // 1. Define the path to your log file (it is in the backend root)
    const logFilePath = path.join(process.cwd(), 'error.log');

    // 2. Check if the file actually exists
    if (!fs.existsSync(logFilePath)) {
        return res.status(404).json({
            status: 0,
            code: 404,
            message: ["The error.log file does not exist yet."]
        });
    }

    // 3. Set headers to force the browser to download the file
    res.setHeader('Content-Disposition', 'attachment; filename="server-error.log"');
    res.setHeader('Content-Type', 'text/plain');

    // 4. Create a read stream and pipe it to the response
    const fileStream = fs.createReadStream(logFilePath);
    
    fileStream.on('error', (err) => {
        console.error("Error streaming log file:", err);
        res.status(500).send("Error downloading file.");
    });

    fileStream.pipe(res);
});