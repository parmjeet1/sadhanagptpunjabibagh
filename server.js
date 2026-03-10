import express from 'express';
import cron from 'node-cron';
import axios from 'axios';

import bodyParser from 'body-parser';
import Routes from './routes/Routes.js';
// import StudentRoutes from './SadhanaGPT/Student/Routes/StudentRoutes.js'

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

// https://desktop-4ntjhpk.tail18c2a1.ts.net/auth/google
process.on("uncaughtException", (err) => {
   logger.error({
    api: "unhandledRejection",
    message: reason.message,
    stack: reason.stack
  });

});

process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
});

process.on("warning", (warning) => {
    logger.warn(`Warning: ${warning.message}`);
});
const app  = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3333;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const corsOptions = {
    origin : [
       
        'http://100.91.77.127:2424',
        'http://192.168.1.37:2424',
        'http://192.168.1.29:1112',
        'http://localhost:5173',
      
    ],
    // origin : "*",
    methods: 'GET, POST, PUT, DELETE',
    credentials: true
};

// app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());
app.get('/ping', (req, res) => {
  console.log("pong");
  return res.json({status:1 , code:200 , message:"local server is alive"})
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
  return res.json({status:1 , code:200 , message:"google-call-back"})
    //   res.send('Server is alive');

});


// app.use('/api',StudentRoutes );
app.use('/api',Routes );
app.use(errorHandler);


// app.use('/api',commonRoutes );
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


// cron.schedule('*/10 * * * *', async () => {
//   try {
//    //ping
//     // const response = await axios.get(
//     //   'https://sadhanagpt.onrender.com/counsller-api/counsller-list',
//     //   {
//     //     headers: {
//     //       Authorization: process.env.API_AUTH_KEY, // replace with your token
//     //     },
//     //   }
//     // );
//     const response = await axios.get(
//       'https://desktop-4ntjhpk.tail18c2a1.ts.net/ping',
//       {
        
//       }
//     );

//     console.log('API Response:', response.data);
//     console.log('Cron job finished at:', new Date());
//   } catch (error) {
//     console.error('Error in cron job:', error.message);
//   }
// });

