// Real wiring of the Reading + Lectures handlers to the app database.
// Routes (see routes/Routes.js) import from here.
import db from "../../config/database.js";
import { createReadingHandlers } from "./ReadingStudentController.js";
import { createLectureHandlers } from "./LectureStudentController.js";
import { createCounsellorReadingHandlers } from "./CounsellorReadingController.js";
import { createCounsellorLectureHandlers } from "./CounsellorLectureController.js";

export const { getReadingPlan, setBookStatus, addMyBook, removeMyBook } = createReadingHandlers(db);
export const { getLecturePlan, markHeard, unmarkHeard, addMyLecture, removeMyLecture } = createLectureHandlers(db);
export const {
  getScopes: getReadingScopes, getScopePlan: getReadingScopePlan, savePlan: saveReadingPlan,
  resetPlan: resetReadingPlan, getMenteesStatus: getReadingMenteesStatus,
} = createCounsellorReadingHandlers(db);
export const {
  getScopePlan: getLectureScopePlan, savePlan: saveLecturePlan,
  resetPlan: resetLecturePlan, getMenteesLectures,
} = createCounsellorLectureHandlers(db);
