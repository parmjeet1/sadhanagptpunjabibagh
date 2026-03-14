import db from "../../config/database.js";
import { mergeParam } from "@sadhna/utils/utils.js";
export const Register=(req,resp)=>{
const{name, }=mergeParam(req)
   
    return resp.json({
        status:1,
        code:200,
        message:['success']

    })

}