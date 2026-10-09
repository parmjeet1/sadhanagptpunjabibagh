// Real wiring of the Reading + Lectures handlers to the app database.
// Routes (see routes/Routes.js) import from here.
import db from "../../config/database.js";
import { createReadingHandlers } from "./ReadingStudentController.js";
import { createLectureHandlers } from "./LectureStudentController.js";

export const { getReadingPlan, setBookStatus, addMyBook, removeMyBook } = createReadingHandlers(db);
export const { getLecturePlan, markHeard, unmarkHeard, addMyLecture, removeMyLecture } = createLectureHandlers(db);
