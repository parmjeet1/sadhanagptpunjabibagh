import express from 'express';
import cron from 'node-cron';

import bodyParser from 'body-parser';
import Routes from './routes/Routes.js';
import db from './config/database.js';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { errorHandler } from './middleware/errorHandler.js';
import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import passport from 'passport';
import session from "express-session";
import authRoutes from "./routes/auth.js";
import "./config/passport.js";
import logger from './logger.js';
import { processRewardRules } from './SadhanaGPT/Controllers/CronJobController.js';
import { processInactivityReminders,dispatchWeeklyCounsellorReports } from './SadhanaGPT/cronjobs/Email-notificatiion.js';
import { sendSadhanaWhatsappReminders } from './SadhanaGPT/cronjobs/WhatsAppMessage.js';


process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

process.on("warning", (warning) => {
  logger.warn(`Warning: ${warning.message}`);
});
const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT ||3000;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const corsOptions = {
  origin: [
    "https://sadhanagpt.com",
    "http://sadhanagpt.com",
     "http://localhost:5173",
    "http://98.93.17.203:3000",
    "https://www.sadhanagpt.com",
    
    
  ],
  // origin : "*",
  methods: 'GET, POST, PUT, DELETE',
  credentials: true
};

// app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, access_token");
    return res.sendStatus(204);
  }
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());
app.get('/ping', (req, res) => {
  console.log("pong");
  return res.json({ status: 1, code: 200, message: "latest updated v1" })
  //   res.send('Server is alive');

});
app.use("/auth", authRoutes);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/google-call-back', (req, res) => {
  return res.json({ status: 1, code: 200, message: "google-call-back" })

});


app.use('/api', Routes);



// start react git
  
    app.use(express.static(path.join(__dirname, 'dist')));
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
/// end react 
app.use(errorHandler);
const server = http.createServer(app);
server.listen(PORT,'0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});



// for 12 pm every day '0 12 * * *
// cron.schedule('*/1  * * * *', async () => {

// // dispatchWeeklyCounsellorReports();  
// // processInactivityReminders();
//   // processRewardRules();
// });

cron.schedule('0 0 * * 7', async () => {

  dispatchWeeklyCounsellorReports();


});
// Schedule: Every Saturday (6) at 10:00 AM
// 
// cron.schedule('0 10 * * 6', async () => {
cron.schedule('0 10 * * 0', async () => {

    console.log("⏰ Saturday 10 AM: Dispatching Sadhana Reminders...");
    await sendSadhanaWhatsappReminders();
});


//  // processInactivityReminders();
  // processRewardRules();