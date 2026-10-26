import db from "../config/database.js";
import { sendNotifyWhatsapp } from "./whatsappNotify.js";

// One reusable "counsellor sends a message to students" function, used for one student
// (mentee page) and many students (Birds Eye View).
// For every student: saves the in-app notification (same row as before) and sends the WhatsApp template.
// counselor_name in WhatsApp = the logged-in counsellor's name.

const WHATSAPP_AT_ONCE = 5;

export const notifyStudents = async ({ senderId, studentIds, text, heading = "" }) => {
  const ids = [...new Set((studentIds || []).map(String).filter(Boolean))];
  const summary = { sent: 0, whatsapp: { sent: 0, failed: 0, no_mobile: 0, not_configured: 0 }, results: [] };
  if (!ids.length) return summary;

  const [[sender]] = await db.query(`SELECT name FROM users WHERE user_id = ? LIMIT 1`, [senderId]);
  const [students] = await db.query(`SELECT user_id, name, mobile FROM users WHERE user_id IN (?)`, [ids]);
  const byId = new Map(students.map((s) => [String(s.user_id), s]));

  // In-app notifications: one row per student, same values as the old single-student code.
  const rows = ids.map((id) => [heading, text, "custom_notification", "student", "admin", senderId, id, "cusotm_notification"]);
  await db.query(
    `INSERT INTO notifications (heading, description, module_name, panel_to, panel_from, created_by, receive_id, href) VALUES ?`,
    [rows]
  );
  summary.sent = ids.length;

  // WhatsApp, a few at a time. A failure here never undoes the in-app notification.
  for (let i = 0; i < ids.length; i += WHATSAPP_AT_ONCE) {
    const batch = ids.slice(i, i + WHATSAPP_AT_ONCE);
    const statuses = await Promise.all(batch.map((id) =>
      sendNotifyWhatsapp({ mobile: byId.get(id)?.mobile, counselorName: sender?.name, text })
    ));
    batch.forEach((id, k) => {
      summary.whatsapp[statuses[k]] = (summary.whatsapp[statuses[k]] || 0) + 1;
      summary.results.push({ student_id: id, whatsapp: statuses[k] });
    });
  }
  return summary;
};
