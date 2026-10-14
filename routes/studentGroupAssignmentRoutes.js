import { Router } from 'express';
import { Authorization } from '../middleware/AuthorizationMiddleware.js';
import { apiAuthentication } from '../middleware/apiAuthenticationMiddleware.js';
import { getStudentGroupAssignmentController } from '../SadhanaGPT/Controllers/studentGroupAssignmentController.js';

const router = Router();

router.get(
  '/student-group-assignment',
  Authorization,
  apiAuthentication,
  getStudentGroupAssignmentController
);

export default router;
