import express from "express";
import passport from "passport";

const router = express.Router();

// Google Login
router.get("/google", (req, res) => {
  // directly redirect to callback (skip Google)
  res.redirect("/auth/google/callback");
});
// router.get(
//   "/google",
//   passport.authenticate("google", { 
//     scope: ["profile", "email"],
//     session: false

//    })
  
// );

// Callback
router.get(
  "/x-google/callback",
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
     const user = "req.user";
     const frontendUrl = "http://localhost:5173/auth/callback";
const userParam = encodeURIComponent(JSON.stringify(user));
res.redirect(`${frontendUrl}?user=${userParam}`);
  //  res.json({
  //     message: " Login successful",
  //     // user,
  //   });
  }
);

router.get("/google/callback", (req, res) => {

  // 🔥 Dummy user data
  const user = {
    google_id: "dummy123",
    name: "Paramjeet Singh",
    email: "test@gmail.com",
    picture: "https://via.placeholder.com/150"
  };

  const frontendUrl = "http://localhost:5173/auth/callback";

  const userParam = encodeURIComponent(JSON.stringify(user));
console.log("Redirecting to frontend with user:", user);
  res.redirect(`${frontendUrl}?user=${userParam}`);
});

// Logout
router.get("/logout", (req, res) => {
  req.logout(() => {
    res.send("Logged out");
  });
});

export default router;
