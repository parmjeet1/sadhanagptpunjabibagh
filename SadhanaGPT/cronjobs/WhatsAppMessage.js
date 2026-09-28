import axios from 'axios';
import db from '../../config/database.js'

export const sendSadhanaWhatsappReminders = async () => {
    try {
        console.log("Starting Saturday Sadhana WhatsApp reminders...");

        // 1. Fetch students and their mentor names
        // We filter by mentors who have auto-reporting enabled
        const [students] = await db.execute(`
            SELECT 
                u.name AS student_name,
                u.mobile AS student_phone,
                c.name AS mentor_name
            FROM user_counsellors uc
            JOIN users u ON uc.user_id = u.user_id
            JOIN users c ON uc.counsller_id = c.user_id
            WHERE c.auto_report_status = 1
        `);

        if (students.length === 0) {
            console.log("No students found for active mentors. Skipping reminders.");
            return;
        }

        const API_URL = "https://wav2.nitaitechnologies.com/api/message/send";
        const API_KEY = "4d4a04fae26232679ecdc87eb9ac9d56ade6887dd7a545ec51d5a4f80ff7462a";

        // 2. Iterate and send messages
        for (const student of students) {
            if (!student.student_phone) continue;

            const studentName = student.student_name || "Student";
            const mentorName = student.mentor_name || "your Mentor";
            
            // Format the message as requested
            const message = `Hare Krishna ${studentName}, kindly fill your sadhna for the last week in SadhnaGPT App because tomorrow the weekly report will be sent to your mentor ${mentorName}. Prabhu JI
             Your Servants `;
// console.log(`Preparing to send WhatsApp reminder to ${studentName} (91${student.student_phone}) with mentor ${mentorName}`);
            try {
                // Sending the POST request to the WhatsApp API
                await axios.post(API_URL, {
                    phoneNumber: `91${student.student_phone}`, // Ensure this includes country code (e.g., 91...)
                    message: message
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': API_KEY
                    }
                });
                
                // console.log(`✅ Message sent to: ${studentName}`);
            } catch (err) {
                console.error(`❌ Failed to send to ${studentName}:`, err.response?.data || err.message);
            }

            // Small delay (300ms) to prevent hitting rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log("✅ All Saturday WhatsApp reminders processed.");
    } catch (error) {
        console.error("Critical error in sendSadhanaReminders:", error);
    }
};
