import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

console.log("=== GROQ SERVICE INITIALIZED ===");
console.log("AI Model Expected:", process.env.AI_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct");
console.log("Groq Key Present:", !!process.env.GROQ_API_KEY);

const getModel = () => {
    const envModel = process.env.AI_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
    if (envModel !== "meta-llama/llama-4-scout-17b-16e-instruct") {
        console.warn(`[WARN] Model ${envModel} is not meta-llama/llama-4-scout-17b-16e-instruct`);
    }
    return envModel;
};

const extractJson = (content) => {
    try {
        console.log("extractJson: Attempting direct parse...");
        const parsed = JSON.parse(content);
        console.log("[GroqService] JSON Parsed successfully");
        return parsed;
    } catch (e) {
        console.log("extractJson: Direct parse failed. Attempting regex extraction...");
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const extracted = JSON.parse(jsonMatch[0]);
                console.log("[GroqService] JSON Parsed (via regex extraction)");
                return extracted;
            } catch (err) {
                console.error("extractJson: Regex extracted string is still invalid JSON.");
                throw { errorType: "JSON_PARSE_ERROR", message: "Extracted content is not valid JSON", rawContent: content };
            }
        }
        console.error("extractJson: No JSON object found in content.");
        throw { errorType: "JSON_PARSE_ERROR", message: "No JSON object found in AI response", rawContent: content };
    }
};

export const generateStudentInsights = async ({ currentKpis, previousKpis }) => {
    console.log("=== AI ANALYSIS STARTED ===");
    console.log("Model:", getModel());
    console.log("API Key Exists:", !!process.env.GROQ_API_KEY);

    if (!process.env.GROQ_API_KEY) {
        throw { errorType: "API_KEY_MISSING", message: "GROQ_API_KEY is missing in environment variables." };
    }
    
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `You are SadhanaGPT AI. Analyze student KPIs for counselors. Output ONLY raw JSON.

STRICT RULES:
1. NEVER mention the Health Score or Risk Level in your response.
2. All metric scores are percentages; if you must mention a number, append '%'.
3. Output EXACTLY ONE single-line string (max 20 words) per field/array item.
4. NO markdown formatting (do NOT use \`\`\`json). NO conversational text before or after the JSON.

EXPECTED JSON SCHEMA & EXAMPLE:
{
  "overallStatus": "Good progress in morning routines but requires better daily tracking.",
  "strengths": [
    "Excellent and consistent wake-up discipline at 4:00 AM."
  ],
  "laggings": [
    "Tracking consistency is low at 50%, missing one daily log."
  ],
  "recommendations": [
    "Set up daily automated reminders to improve tracking habits."
  ]
}`;
    const userMessage = `Here is the student data:
${JSON.stringify(currentKpis, null, 2)}`;

    try {
        console.log("Sending request to Groq...");
        
        const response = await groq.chat.completions.create({
            model: getModel(),
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_completion_tokens: 500
        });

        console.log("Groq response received.");
        const aiOutput = response.choices[0]?.message?.content;
        
        console.log("Raw AI Content:");
        console.log(aiOutput);

        // Parse and validate
        let parsed = extractJson(aiOutput);

        // Basic structural validation
        if (!parsed.overallStatus) parsed.overallStatus = "Data reviewed successfully.";
        if (!Array.isArray(parsed.strengths)) parsed.strengths = [];
        if (!Array.isArray(parsed.laggings)) parsed.laggings = [];
        if (!Array.isArray(parsed.recommendations)) parsed.recommendations = [];

        // Enforce max lengths
        parsed.strengths = parsed.strengths.slice(0, 3);
        parsed.laggings = parsed.laggings.slice(0, 3);
        parsed.recommendations = parsed.recommendations.slice(0, 3);

        console.log("Validation Passed. Returning parsed payload.");
        return parsed;

    } catch (error) {
        console.error("Groq Error:");
        if (error.errorType) {
            console.error("Custom Error Type:", error.errorType);
            console.error("Message:", error.message);
            throw error;
        } else {
            console.error(error);
            const status = error?.status || "Unknown";
            const message = error?.error?.message || error.message || "Unknown error";
            throw { errorType: "GROQ_API_ERROR", status, message };
        }
    }
};

export const chatWithAI = async ({ systemPrompt, messages }) => {
    console.log("=== AI CHAT STARTED ===");
    console.log("Model:", getModel());
    console.log("API Key Present:", !!process.env.GROQ_API_KEY);

    if (!process.env.GROQ_API_KEY) {
        throw { errorType: "API_KEY_MISSING", message: "GROQ_API_KEY is missing in environment variables." };
    }
    
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    try {
        console.log("[GroqService] Groq Request Started (Chat)");
        const response = await groq.chat.completions.create({
            model: getModel(),
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            temperature: 0.5,
            max_completion_tokens: 400,
            max_tokens: 400
        });

        console.log("[GroqService] Groq Response Received (Chat)");
        console.log("Usage:", response.usage);
        console.log("Content:");
        console.log(response.choices[0].message.content);

        const aiOutput = response.choices[0]?.message?.content;
        
        console.log("RAW AI OUTPUT:");
        console.log(aiOutput);

        return aiOutput;
    } catch (error) {
        console.error("Groq Chat API Error:");
        console.error(error);
        const status = error?.status || "Unknown";
        const message = error?.error?.message || error.message || "Unknown error";
        throw { errorType: "GROQ_API_ERROR", status, message };
    }
};
