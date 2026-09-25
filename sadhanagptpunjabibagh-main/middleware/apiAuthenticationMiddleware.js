import db from "../config/database.js";
import { mergeParam } from "../utils/utils.js";

export const apiAuthentication = async (req, resp, next) => {
  try{  

    const token = req.headers["accesstoken"];
    console.log(req.url,", payload:", mergeParam(req));

    if (!token) {
      return resp.status(401).json({ message: 'Access Token key is missing', code: 400, data: {}, status: 0 });
    }
    
    // Securely resolve user by token
    const [[authUser]] = await db.execute(`SELECT * FROM users WHERE access_token = ?`, [token]);
    
    if (!authUser){
      return resp.status(401).json({ message: 'Access Denied. Invalid Access Token key', code: 401, data: {}, status: 0 });
    }

    // Attach user to req object for modern secure controllers
    req.user = authUser;

    // Detect spoofing attempts (if frontend passed a user_id)
    const providedUserId = mergeParam(req).user_id;
    if (providedUserId && String(providedUserId) !== String(authUser.user_id)) {
      console.warn(`[Security Alert] ID spoof attempt blocked. Token belongs to ${authUser.user_id}, requested ${providedUserId}`);
    }

    // Inject secure user_id to satisfy legacy code relying on mergeParam(req).user_id
    if (req.body && typeof req.body === 'object') {
      req.body.user_id = authUser.user_id;
    } else {
      req.body = { user_id: authUser.user_id };
    }
    if (req.query && typeof req.query === 'object') {
      req.query.user_id = authUser.user_id;
    } else {
      req.query = { user_id: authUser.user_id };
    }
  
    next();
  } catch (error) {
    console.error("[Auth] Middleware Error:", error);
    return resp.status(500).json({message: 'Internal Server Error',code: 500,data: {},status: 0,});
  }
};
export const checkCounsellor = async (req, res, next) => {
  try {

    // Securely pull from req.user if apiAuthentication already ran, fallback to mergeParam for safety
    const user_id = req.user?.user_id || mergeParam(req).user_id;

    if (!user_id) {
      return res.status(400).json({
        status: 0,
        message: ["user_id is required"]
      });
    }

    const [user] = await db.execute(`select user_id from users where
       user_id = ? and user_type = 'counsellor'`,
      [user_id]
    );

    if (user.length===0) {
      return res.status(404).json({
        status: 0,
        message: ["user not found or not a counsellor"]
      });
    }

    next();

  } catch (error) {

    console.error("[Auth] checkCounsellor middleware error", error);

    return res.status(500).json({
      status: 0,
      message: ["Server error"]
    });

  }
};