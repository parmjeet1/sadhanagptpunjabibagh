import axios from "axios";

// Sends the WhatsApp notify template through the Updatrr (Prizma) API. Template text:
//   "Hare Krishna, {{counselor_name}} has sent you a new message: {{text}} on SadhanaGPT."
// Settings come from .env:
//   WHATSAPP_NOTIFY_TEMPLATE  approved template name
//   WHATSAPP_SECRET_KEY       Updatrr API key (sent as X-UPDATRR-API-KEY)
// Never throws: the in-app notification must not fail because of WhatsApp.
// Returns "sent" | "failed" | "no_mobile" | "not_configured".

const API_URL = "https://prizmacommunicator.prizmacommerce.com/api/v1/whatsapp/templates/send";

/** 10-digit Indian numbers get 91 in front; anything else is sent as digits only. */
export const toWhatsappNumber = (mobile) => {
  let digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 ? digits : "";
};

/** WhatsApp rejects template values with new lines, tabs or more than 4 spaces in a row. */
export const cleanTemplateText = (value, max = 1000) =>
  String(value || "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, max);

export const sendNotifyWhatsapp = async ({ mobile, counselorName, text }) => {
  const template = process.env.WHATSAPP_NOTIFY_TEMPLATE;
  const apiKey = process.env.WHATSAPP_SECRET_KEY;
  if (!template || !apiKey) return "not_configured";

  const phone = toWhatsappNumber(mobile);
  if (!phone) return "no_mobile";

  const body = {
    to: phone,
    templateName: template,
    language: "en_US",
    parameters: {
      counselor_name: cleanTemplateText(counselorName || "Your counsellor", 100),
      text: `"${cleanTemplateText(text, 998)}"`, // the message is shown in double quotes
    },
  };

  try {
    await axios.post(API_URL, body, {
      headers: { "Content-Type": "application/json", "X-UPDATRR-API-KEY": apiKey },
      timeout: 10000,
    });
    return "sent";
  } catch (err) {
    console.error("WhatsApp notify failed:", err.response?.status || err.message);
    return "failed";
  }
};
