import db from "../../config/database.js";
import { createNotification, pushNotification, sendNotification } from "../../utils/utils.js";

export const processRewardRules = async () => {

  try {

    // 1️⃣ Get active reward rules
    const [rules] = await db.execute(`
      SELECT rr.reward_name, fa.activity_type, rr.reward_id, rr.counsller_id, rr.activity_id, rr.target_value, rr.required_days
      FROM reward_rules rr
      JOIN fix_activities fa on rr.activity_id =fa.activity_id
      WHERE status = 1
    `);

    for (const rule of rules) {

      const { reward_name,reward_id, counsller_id, activity_id, target_value, required_days,activity_type } = rule;

      // 2️⃣ Get students under this counsellor
      const [students] = await db.execute(`
        SELECT u.fcm_token, uc.user_id, u.name
        FROM user_counsellors uc
        JOIN users u ON uc.user_id = u.user_id
        WHERE uc.counsller_id = ?
      `,[counsller_id]);

      for (const student of students) {

        const student_id = student.user_id;
        const student_name = student.name;
       const fcm_token = student.fcm_token;



        // 3️⃣ Check performance rule
        // if (rule_type === "performance") {
/*
if activity_type == numb or min
    CAST(count AS UNSIGNED)

if activity_type == yes_no
    count = 'yes'

if activity_type == time
    TIME(count)
*/    let condition = "";
        let select_params = "";
        let having_condition = "";
        let params = [];

            if (activity_type === "numb") {
               select_params = "COUNT(id) AS total_days, AVG(CAST(count AS UNSIGNED)) AS avg_num";
            having_condition = "HAVING total_days >= ? AND avg_num >= ?";


            // select_params = "COUNT(id) AS total_days";
            // condition = "AND CAST(count AS UNSIGNED) >= ?";
            // having_condition = "HAVING total_days >= ?";

            params.push(required_days, target_value);

            }

            else if (activity_type === "min") {

            select_params = "COUNT(id) AS total_days, AVG(CAST(count AS UNSIGNED)) AS avg_minutes";
            having_condition = "HAVING total_days >= ? AND avg_minutes >= ?";

            params.push(required_days, target_value);

            }

            else if (activity_type === "yes_no") {

            select_params = "COUNT(id) AS total_days";
            condition = "AND count = 'yes'";
            having_condition = "HAVING total_days >= ?";

            params.push(required_days);

            }

            else if (activity_type === "time") {

            select_params = "COUNT(id) AS total_days";
            condition = "AND TIME(count) >= TIME(?)";
            having_condition = "HAVING total_days >= ?";

            params.push(target_value, required_days);

            }

            let query = `
            SELECT ${select_params}
            FROM daily_report
            WHERE user_id = ?
            AND activity_id = ?
            ${condition}
            ${having_condition}
            `;

            console.log(query, [student_id, activity_id, ...params]);

            const [activity] = await db.execute(query, [
            student_id,
            activity_id,
            ...params
            ]);
            console.log("before condition required_days",activity);

          if (activity.length>0) {
console.log("after condition  matched required_days",activity);

            // 4️⃣ Check reward already given
            // const [exists] = await db.execute(`
            //   SELECT id
            //   FROM user_rewards
            //   WHERE user_id = ?
            //   AND reward_id = ?
            // `,[student_id, reward_id]);

            // if (exists.length === 0) {

              // 5️⃣ Insert reward
             await db.execute(`
            INSERT IGNORE INTO user_rewards (user_id,activity_id,reward_id)
            VALUES (?, ?,?)
          `,[student_id,activity_id,reward_id]);
          
          //updated
      await sendNotification("USER_REWARDED",{reward_id,student_name,reward_name},student_id,"")
await pushNotification(fcm_token, "hare krsna paramjeet","you are doing good",  'user' );
            // }

          }

       // }

      }

    }

    console.log("Reward rules processed successfully");

  } catch (error) {
    console.error("Reward rule cron error:", error);
  }

};