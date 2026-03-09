import { getPaginatedData, insertRecord, queryDB } from "../../utils/dbUtils.js";
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
        const { page_no=1,user_id,  search_text='',rowSelected} = mergeParam(req);
       
       
        const { isValid, errors } = validateFields(mergeParam(req), { page_no: ["required"] });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

     const params = {
            tableName: 'users us',
           columns: `us.user_id, us.name,us.user_type, us.email, us.mobile, us.fcm_token, us.created_at`,
           joinCondition :'us.user_id = uc.user_id',
        joinTable :'user_counsellors uc',
        
        sortColumn:'us.created_at',
        sortOrder: 'DESC',
        page_no,
        limit: rowSelected || 10,
        liveSearchFields: ['name', ],
        liveSearchTexts: [search_text],
        whereField: ['uc.counsller_id'],
        whereValue: [user_id],
        whereOperator: ['=']
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

export const sadhanReportlist = asyncHandler(async (req, resp) => {
    try {
        const { page_no=1,user_id,student_id,  search_text='',rowSelected} = mergeParam(req);
       
       
        const { isValid, errors } = validateFields(mergeParam(req), { page_no: ["required"] });
        if (!isValid) return resp.json({ status: 0, code: 422, message: errors });

     const params = {
        tableName: 'daily_report dr',
        columns: `fa.activity_id, fa.name, fa.description,  dr.activity_date, dr.count, dr.unit`,
        joinTable :'fix_activities fa',
        joinCondition :'fa.activity_id = dr.activity_id',
        sortColumn:'dr.created_at',
        sortOrder: 'DESC',
        page_no,
        limit: rowSelected || 10,
        liveSearchFields: ['fa.name', ],
        liveSearchTexts: [search_text],
        whereField: ['dr.user_id'],
        whereValue: [student_id],
        whereOperator: ['=']
        };
       
        const result = await getPaginatedData(params);
        
          const student= await queryDB(`SELECT user_id,name FROM users WHERE user_id = ?`,
             [student_id]); 

        return resp.json({
            status: 1,
            code: 200,
            message: ["users list fetched successfully!"],
           student,
            data    :   result.data,
            total_page: result.totalPage,
            total: result.total,
           
        });//

    } catch (error) {
        console.error('Error fetching student report List:', error);
        return resp.status(500).json({
            status: 0,
            code: 500,
            message: 'Error fetching student report List'
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