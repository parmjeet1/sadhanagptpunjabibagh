import express from "express";
import passport from "passport";
import { queryDB } from "../utils/dbUtils.js";
import crypto from "crypto";
const router = express.Router();
import db from "../config/database.js";

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
  // (req, res) => {
  //    const user = req.user;

  //   const googleUser = {
  //     google_id: user.id,
  //     name: user.displayName,
  //     email: user.emails?.[0]?.value,
  //     picture: user.photos?.[0]?.value,
  //   };
  //  res.json(googleUser);
  // }
//   async (req, res) => {
//      const user = req.user;
//      let frontendUrl = "http://localhost:5173/auth/callback";
// const userParam = encodeURIComponent(JSON.stringify(user))


//      const user_check =await queryDB('SELECT user_id, name, email,user_type,counsller_id FROM users WHERE email = ? and google_id=?', [user.emails,user.google_id]);
//      if(user_check){
//        const access_token = crypto.randomBytes(12).toString("hex");
//       await queryDB('UPDATE users SET access_token  = ? WHERE email = ? and google_id=?', [access_token,user.emails,user.google_id]);

//      }
//      ;


// //console.log("url",`${frontendUrl}?user=${userParam}`);
// res.redirect(`${frontendUrl}?user=${userParam}`);
//   //  res.json({
//   //     message: " Login successful",
//   //     // user,
//   //   });
//   }
async (req, res) => {
  try {
    const user = req.user;
//new updated
     const frontendUrl = "https://www.sadhanagpt.com/oauth-success";
    

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
