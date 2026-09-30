const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

admin.initializeApp();
const db = admin.firestore();

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(bodyParser.json());

// --- Your APIs here ---

// Add activity
app.post("/add-activity", async (req, res) => {
    try {
        const { name, description, count_type, activity_type } = req.body;
        const docRef = await db.collection("activities").add({
            name,
            description,
            count_type,
            activity_type,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(200).send({ success: true, id: docRef.id });
    } catch (error) {
        res.status(500).send({ success: false, error: error.message });
    }
});

// Get all activities
app.get("/activities", async (req, res) => {
    try {
        const snapshot = await db.collection("activities").get();
        const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send({ success: true, activities });
    } catch (error) {
        res.status(500).send({ success: false, error: error.message });
    }
});

// Export Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
