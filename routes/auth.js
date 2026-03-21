import express from "express";
import passport from "passport";

const router = express.Router();

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
  (req, res) => {
     const user = req.user;
   res.json({
      message: "Login successful",
      user,
    });
  }
);

// Logout
router.get("/logout", (req, res) => {
  req.logout(() => {
    res.send("Logged out");
  });
});

export default router;
