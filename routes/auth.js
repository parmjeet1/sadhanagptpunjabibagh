import express from "express";
import passport from "passport";
import { queryDB } from "../utils/dbUtils.js";
import crypto from "crypto";
const router = express.Router();
import db from "../config/database.js";
import dotenv from 'dotenv';
dotenv.config();

// Google Login
router.get(
  "/google",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    session: false

   })
  
);

// Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { 
    failureRedirect: "/",
   session: false, }),
  
async (req, res) => {
  try {
    const user = req.user;
//new updated

    //  const frontendUrl = "https://www.sadhanagpt.com/oauth-success";
     const frontendUrl = process.env.FRONT_END_CALL_BACK_URL //"http://localhost:5173/oauth-success";
    

    // ✅ Check user in DB
    const user_check = await queryDB(
      `SELECT u.user_id, u.name, u.email, u.user_type, 
      uc.counsller_id as primary_counsller_id FROM users u
      LEFT JOIN user_counsellors uc on u.user_id = uc.user_id AND uc.counsllor_type='primary'
      WHERE u.email = ? `,
      [user.email]
    );

    let responseData = {};
   
    if (user_check) {

      const access_token = crypto.randomBytes(12).toString("hex");

      await db.execute(
        'UPDATE users SET access_token = ? WHERE email = ?',
        [access_token, user.email]
      );

      responseData = {
        status: "existing_user",
        user_id: user_check.user_id,
        name: user_check.name,
        email: user_check.email,
        user_type: user_check.user_type,
        counsller_id: user_check.counsller_id,
        access_token
      };

    } else {
      // ✅ New user
      responseData = {
        status: "new_user",
        name: user.name,
        email: user.email,
        google_id: user.google_id,
        picture: user.picture
      };
    }

    // ✅ Encode and send
    const encodedData = encodeURIComponent(JSON.stringify(responseData));
console.log("Redirecting to:", `${frontendUrl}?data=${encodedData}`);
    res.redirect(`${frontendUrl}?data=${encodedData}`);

  } catch (err) {
    console.error(err);
    res.redirect("https://www.sadhanagpt.com/login?error=auth_failed");
  }
}
);

// Logout
router.get("/logout", (req, res) => {
  req.logout(() => {
    res.send("Logged out");
  });
});

export default router;
