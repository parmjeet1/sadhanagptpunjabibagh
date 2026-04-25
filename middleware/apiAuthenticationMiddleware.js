import db from "../config/database.js";
import { mergeParam } from "../utils/utils.js";

export const apiAuthentication = async (req, resp, next) => {
  try{  

     const token = req.headers["accesstoken"];
    const {user_id} = mergeParam(req);
     console.log("req",mergeParam(req))
    //  const db=req.db;

  
    if (!token) {
      return resp.status(401).json({ message: 'Access Token key is missing', code: 400, data: {}, status: 0 });
    }
    
    if (!user_id || typeof user_id !== 'string' || user_id.trim() === ''){
      return resp.status(400).json({ message: 'User ID is missing', code: 400, data: {}, status: 0 });
    }
  
    const [[result]] = await db.execute(`SELECT COUNT(*) AS count FROM users WHERE access_token = ? AND user_id = ?`,[token, user_id]);
    
    if (result.count === 0){
      return resp.status(401).json({ message: 'Access Denied. Invalid Access Token key', code: 401, data: {}, status: 0 });
    }
  
    next();
  } catch (error) {
    return resp.status(500).json({message: 'Internal Server Error',code: 500,data: {},status: 0,});
  }
};
export const checkCounsellor = async (req, res, next) => {
  try {

    const { user_id } = mergeParam(req) ;

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

    if (!user.length===0) {
      return res.status(404).json({
        status: 0,
        message: ["user not found or not a counsellor"]
      });
    }

    next();

  } catch (error) {

    console.log("checkCounsellor middleware error", error);

    return res.status(500).json({
      status: 0,
      message: ["Server error"]
    });

  }
};