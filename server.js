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
import { freqSadhnaCronjob, sendSadhanaPushReminders } from './SadhanaGPT/cronjobs/WebPushNotification.js';
import { WeeklyJob } from './SadhanaGPT/SummaryData/summary-report.js';
import { runWeeklyRankJob } from './SadhanaGPT/cronjobs/weeklyRankJob.js';
import TripaRoutes from './tripa-app/src/routes/Routes.js';
import crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = crypto;
}


process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.stack}`);
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
        // origin: [
        //   "https://sadhanagpt.com",
        //   "http://sadhanagpt.com",
        //   "http://localhost:5173",
        //   "https://www.sadhanagpt.com",
        //   "http://localhost:8081"
          
          
        // ],
        origin : "*",
        methods: 'GET, POST, PUT, DELETE',
        credentials: true
      };

      
      app.use(cors(corsOptions));
     
      app.use(express.urlencoded({ extended: true }));
      app.use(express.json());
      app.use(bodyParser.json());
      app.use(cookieParser());
    

      app.use(
        session({
          secret: process.env.SESSION_SECRET,
          resave: false,
          saveUninitialized: true,
        })
      );

      app.use(passport.initialize());
      app.use(passport.session());

        app.use("/auth", authRoutes);
        
     app.get('/', (req, res) => {
        res.send('Backend is running');
      });

    app.use('/api/trip-api', TripaRoutes);

    app.use('/api', Routes);
     app.get('/ping', (req, res) => {
        console.log("pong");
          
        return res.json({ status: 1, code: 200, message: "latest updated v1" })
        //   res.send('Server is alive');

      });

    
      app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
       
      const server = http.createServer(app);
      server.listen(PORT, '0.0.0.0', () => {
        // ── Startup info ────────────────────────────────────────────────────
       
      });

      cron.schedule(
  '0 0 * * 7',
  async () => {
    console.log('Running dispatchWeeklyCounsellorReports:', new Date());

    await dispatchWeeklyCounsellorReports();
  },
  {
    timezone: 'Asia/Kolkata',
  }
);
      // Schedule: Every Saturday (6) at 10:00 AM
      // 
     
       freqSadhnaCronjob();
WeeklyJob();

// Run at 3:00 AM every day to ensure 1AM and 2AM data syncing is complete
cron.schedule(
  '30 3 * * *',
  async () => {
    console.log('Running runWeeklyRankJob:', new Date());
    await runWeeklyRankJob();
  },
  {
    timezone: 'Asia/Kolkata',
  }
);

app.use(errorHandler)