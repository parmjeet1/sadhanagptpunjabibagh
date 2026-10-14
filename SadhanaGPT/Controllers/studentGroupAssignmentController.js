import { asyncHandler, mergeParam } from '../../utils/utils.js';
import { getStudentGroupAssignment } from '../services/studentGroupAssignmentService.js';

export const getStudentGroupAssignmentController = asyncHandler(async (req, res) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({
        status: 0,
        code: 401,
        message: 'Unauthorized: Access token missing or invalid',
      });
    }

    const params = mergeParam(req);
    const targetStudentId = params.student_id || authUser.user_id;

    const data = await getStudentGroupAssignment(
      authUser.user_id,
      authUser.user_type,
      targetStudentId
    );

    return res.status(200).json({
      status: 1,
      code: 200,
      message: 'Student group assignment fetched successfully',
      data,
    });
  } catch (error) {
    if (error.statusCode === 403) {
      return res.status(403).json({
        status: 0,
        code: 403,
        message: error.message || 'Access denied',
      });
    }
    if (error.statusCode === 404) {
      return res.status(404).json({
        status: 0,
        code: 404,
        message: error.message || 'Student not found',
      });
    }
    console.error('[StudentGroupAssignment] Error:', error);
    return res.status(500).json({
      status: 0,
      code: 500,
      message: 'Failed to retrieve student group assignment',
    });
  }
});
