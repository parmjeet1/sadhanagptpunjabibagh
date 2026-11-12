import express from "express";
import passport from "passport";
import { queryDB } from "../utils/dbUtils.js";
import crypto from "crypto";
const router = express.Router();
import db from "../config/database.js";
import dotenv from 'dotenv';
dotenv.config();

// Mobile app support: the app passes ?redirect_uri=sadhanagpt://oauth-success and gets the
// login result back on that deep link instead of the web page. The value travels through
// Google's `state` parameter. Only the app's own scheme is accepted (Expo Go's exp:// scheme
// only when ALLOW_EXPO_GO_REDIRECT=1) so this cannot be used as an open redirect.
const isAllowedAppRedirect = (uri) => {
  if (typeof uri !== "string" || uri.length > 500 || /\s/.test(uri)) return false;
  if (/^sadhanagpt:\/\/[^\s]*$/.test(uri)) return true;
  return process.env.ALLOW_EXPO_GO_REDIRECT === "1" && /^exp:\/\/[^\s]*$/.test(uri);
};
const encodeAppState = (uri) =>
  isAllowedAppRedirect(uri) ? Buffer.from(`app:${uri}`).toString("base64url") : undefined;
const decodeAppState = (state) => {
  try {
    const text = Buffer.from(String(state || ""), "base64url").toString("utf8");
    const uri = text.startsWith("app:") ? text.slice(4) : null;
    return isAllowedAppRedirect(uri) ? uri : null;
  } catch {
    return null;
  }
};

// Google Login
router.get("/google", (req, res, next) => {
  const options = { scope: ["profile", "email"], session: false };
  const state = encodeAppState(req.query.redirect_uri);
  if (state) options.state = state;
  passport.authenticate("google", options)(req, res, next);
});

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
      `SELECT u.access_token, u.user_id, u.name, u.email, u.user_type, 
      uc.counsller_id as primary_counsller_id FROM users u
      LEFT JOIN user_counsellors uc on u.user_id = uc.user_id AND uc.counsllor_type='primary'
      WHERE u.email = ? `,
      [user.email]
    );

    let responseData = {};
   
    if (user_check) {

      // const access_token = crypto.randomBytes(12).toString("hex");

      // await db.execute(
      //   'UPDATE users SET access_token = ? WHERE email = ?',
      //   [access_token, user.email]
      // );

      responseData = {
        status: "existing_user",
        user_id: user_check.user_id,
        name: user_check.name,
        email: user_check.email,
        user_type: user_check.user_type,
        counsller_id: user_check.counsller_id,
        access_token: user_check.access_token
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

    const appRedirect = decodeAppState(req.query.state);
    if (appRedirect) {
      const sep = appRedirect.includes("?") ? "&" : "?";
      return res.redirect(`${appRedirect}${sep}data=${encodedData}`);
    }
    res.redirect(`${frontendUrl}?data=${encodedData}`);

  } catch (err) {
    console.error(err);
    const appRedirect = decodeAppState(req.query.state);
    if (appRedirect) return res.redirect(`${appRedirect}${appRedirect.includes("?") ? "&" : "?"}error=auth_failed`);
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
