import { insertRecord } from "../../utils/dbUtils.js";
import { asyncHandler } from "../../utils/utils.js";
import validateFields from "../../utils/validation.js";

export const addCustomFixActivity = asyncHandler(async (req, resp) => {

    try {

        const request = req.body;

        const { 
            master_activity_id,
            
            name, 
            description, 
            unit, 
            activity_type, 
            target, 
            own_by, 
            counslor_id 
        } = request;

        const { isValid, errors } = validateFields(request, {
            name: ["required"],
            activity_type: ["required"],
            counslor_id: ["required"]
        });

        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

        const columns = [
            'master_activity_id',
            'name',
            'description',
            'unit',
            'activity_type',
            'target',
            'own_by',
            'user_id', 
            'created_at'
        ];

        const values = [
            master_activity_id || null,
            name,
            description || null,
            unit || null,
            activity_type,
            target || null,
            own_by || 0,
            counslor_id,
            new Date().toISOString().slice(0, 19).replace('T', ' ')
        ];

        await insertRecord(
            "fix_activities",
            columns,
            values
        );

        return resp.json({
            status: 1,
            code: 200,
            message: ["Activity added successfully"]
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
