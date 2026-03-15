import { queryDB } from "@sadhna/utils/dbUtils.js";
import { asyncHandler } from "@sadhna/utils/utils.js";

export const registerOnboarding = asyncHandler(async (req, resp) => {

    try {

        const request = req.body;

        const { user_id, user_type, mentor_code, temple_id, name } = request;

        const { isValid, errors } = validateFields(request, {
            user_id: ["required"],
            user_type: ["required"]
        });

        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });


        let update_data = {};

        switch (user_type) {

            // ======================
            // STUDENT REGISTRATION
            // ======================
            case "student":

                const mentor = await queryDB(`SELECT user_id, temple_id FROM users WHERE mentor_code = ?`, [mentor_code]);

                if (!mentor ) {
                    return resp.json({
                        status: 0,
                        code: 404,
                        message: ["Invalid mentor code"]
                    });
                }

                update_data = {
                    name: name,
                    temple_id: mentor.temple_id,
                    parent_mentor_id: mentor.user_id,
                    user_type: "student"
                };

                await updateRecord(
                    "users",
                    update_data,
                    ["user_id"],
                    [user_id]
                );

                break;


            // ======================
            // MENTOR REGISTRATION
            // ======================
            case "mentor":

                const parentMentor = await getRecord(
                    "users",
                    ["user_id", "temple_id", "level"],
                    ["mentor_code"],
                    [mentor_code]
                );

                if (!parentMentor || parentMentor.length === 0) {
                    return resp.json({
                        status: 0,
                        code: 404,
                        message: ["Invalid parent mentor code"]
                    });
                }

                const level = parentMentor[0].level + 1;

                const newMentorCode = generateMentorCode(); // your helper

                update_data = {
                    name: name,
                    temple_id: parentMentor[0].temple_id,
                    parent_mentor_id: parentMentor[0].user_id,
                    level: level,
                    mentor_code: newMentorCode,
                    user_type: "mentor"
                };

                await updateRecord(
                    "users",
                    update_data,
                    ["user_id"],
                    [user_id]
                );

                break;


            default:
                return resp.json({
                    status: 0,
                    code: 422,
                    message: ["Invalid user type"]
                });

        }


        return resp.json({
            status: 1,
            code: 200,
            message: ["Registration completed successfully"]
        });


    } catch (err) {

        console.log("err", err);

        return resp.status(500).json({
            status: 0,
            code: 500,
            message: ['Internal server error']
        });

    }

});