import nodemailer from 'nodemailer';
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    // By using 'service', Nodemailer automatically binds to Gmail's correct
    // ports and STARTTLS configurations safely behind the scenes!
    service: 'gmail',  
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD
    }
});

export default transporter;
