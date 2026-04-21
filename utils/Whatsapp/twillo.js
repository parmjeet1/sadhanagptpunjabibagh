// whatsapp.js
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendWhatsAppNotification(to, message) {
  try {
    const response = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio sandbox number
      to: `whatsapp:+91${to}`,       // Indian number
      body: message
    });
    console.log('Sent:', response.sid);
    return response;
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
sendWhatsAppNotification('9876543210', 'Hare Krishna! Your Sadhana streak is active 🙏');