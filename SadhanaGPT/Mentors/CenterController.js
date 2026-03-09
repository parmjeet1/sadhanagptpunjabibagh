import { getPaginatedData, insertRecord } from "../../utils/dbUtils.js";
import { asyncHandler, mergeParam } from "../../utils/utils.js";
import validateFields from "../../utils/validation.js";

export const addCenter = asyncHandler (async (req, resp) => {

    try {

        const request = req.body;

        const { user_id, group_name, access } = request;

        // ✅ Validation
        const { isValid, errors } = validateFields (request, {
            user_id: ["required"],
            group_name: ["required"]
        });

        if (!isValid) {
            return resp.json({
                status: 0,
                code: 422,
                message: errors
            });
        }

        // ✅ Prepare access JSON (optional)
        let access_data = null;

        if (access && Array.isArray(access)) {
            access_data = JSON.stringify(access);
        }

        // ✅ Insert center
        const insert_data = await insertRecord(
            'center_list',
            ['mentor_id', 'group_name', 'access'],
            [user_id, group_name, access_data]
        );

        if (insert_data) {

            return resp.json({
                status: 1,
                code: 200,
                message: ['Center added successfully!'],
                data: {
                    center_id: insert_data.insertId
                }
            });

        }

    } catch (err) {

        console.log("err", err);

        return resp.status(500).json({
            status: 0,
            code: 500,
            message: ['Internal server error']
        });

    }

});

export const editCenter = asyncHandler(async (req, resp) => {

    try {

        const request = req.body;

        const { user_id, group_id, group_name, access } = request;

        // ✅ Validation
        const { isValid, errors } = validateFields(request, {
            user_id: ["required"],
            group_id: ["required"]
        });

        if (!isValid) {
            return resp.json({
                status: 0,
                code: 422,
                message: errors
            });
        }


        // ✅ Check center exists and belongs to mentor
        const center = await queryDB(
            `SELECT id, mentor_id 
             FROM center_list 
             WHERE group_id = ?`,
            [group_id]
        );

        if (!center.length) {
            return resp.json({
                status: 0,
                code: 404,
                message: ['Center not found']
            });
        }


        // ✅ Security check (recommended)
        if (center.mentor_id !== user_id) {
            return resp.json({
                status: 0,
                code: 403,
                message: ['You are not authorized to edit this center']
            });
        }


        // ✅ Prepare update fields
        let updateFields = [];
        let updateValues = [];


        if (group_name) {
            updateFields.push("group_name = ?");
            updateValues.push(group_name);
        }


        if (access && Array.isArray(access)) {
            updateFields.push("access = ?");
            updateValues.push(JSON.stringify(access));
        }


        if (!updateFields.length) {

            return resp.json({
                status: 0,
                code: 400,
                message: ['Nothing to update']
            });

        }


        updateValues.push(group_id);


        // ✅ Update query
        await queryDB(
            `UPDATE center_list 
             SET ${updateFields.join(", ")}
             WHERE group_id = ?`,
            updateValues
        );



        // ✅ Return updated data
        const updatedCenter = await queryDB(
            `SELECT id, group_id, group_name, access 
             FROM center_list 
             WHERE group_id = ?`,
            [group_id]
        );

        return resp.json({

            status: 1,
            code: 200,
            message: ['Center updated successfully!'],
            data: updatedCenter[0]

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
export const studentlist = asyncHandler(async (req, resp) => {
    try {
        /*
        ifnull((select base_price from cycle_pricing cp where cp.station_id=cycle_list.station_id  and cp.type_of_cycle=cycle_list.cycle_type
             and cp.type_of_cycle=cycle_list.cycle_type ),0)as base_price
        */
        const { page_no=1,counsller_id,  search_text='',rowSelected} = mergeParam(req);
       
       
        const { isValid, errors } = validateFields(mergeParam(req), { page_no: ["required"] });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

     const params = {
            tableName: 'users ',
           columns: `user_id, name`,
        
        sortColumn:'created_at',
        sortOrder: 'DESC',
        page_no,
        limit: rowSelected || 10,
        liveSearchFields: ['name', ],
        liveSearchTexts: [search_text],
        whereField: ['status','mentor_id'],
        whereValue: [1,counsller_id],
        whereOperator: ['=','=']
        };
       
        const result = await getPaginatedData(params);
        
           

        return resp.json({
            status: 1,
            code: 200,
            message: ["users list fetched successfully!"],
            data: result,
            total_page: result.totalPage,
            total: result.total,
           
        });//

    } catch (error) {
        console.error('Error fetching cycle List:', error);
        return resp.status(500).json({
            status: 0,
            code: 500,
            message: 'Error fetching cycle List'
        });
    }
});


export const assignStudentsToGroup = asyncHandler(async (req, resp) => {

    try {

        const request = req.body;

        const { group_id, students } = request;


        // ✅ Validation
        const { isValid, errors } = validateFields(request, {
            group_id: ["required"],
            students: ["required"]
        });

        if (!isValid) {

            return resp.json({
                status: 0,
                code: 422,
                message: errors
            });

        }


        if (!Array.isArray(students) || students.length === 0) {

            return resp.json({
                status: 0,
                code: 422,
                message: ['students must be array']
            });

        }


        // ✅ Update users table
        await queryDB(
            `UPDATE users 
             SET group_id = ? 
             WHERE user_id IN (?)`,
            [group_id, students]
        );



        return resp.json({

            status: 1,
            code: 200,
            message: ['Students assigned successfully']

        });


    } catch (err) {

        console.log(err);

        return resp.status(500).json({

            status: 0,
            code: 500,
            message: ['Internal server error']

        });

    }

});