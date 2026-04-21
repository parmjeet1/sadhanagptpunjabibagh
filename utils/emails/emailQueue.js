import { EventEmitter } from 'events';
import transporter from './mailer.js';
import dotenv from "dotenv";
dotenv.config();

class EmailQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isProcessing = false;
        this.on('enqueueEmail', this.processQueue.bind(this));
    }

    addEmail(toAddress, subject, html, attachment = null) {
        // console.log("Added to queue:", toAddress, subject);
        this.queue.push({ toAddress, subject, html, attachment });
        this.emit('enqueueEmail');
    }

    async processQueue() {
        // Prevent concurrent queue bleeding
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const { toAddress, subject, html, attachment } = this.queue.shift();

            try {
                const mailOptions = {
                    // Gmail forces you to send from your authenticated user email address
                    from: `"Paramjeet" <${process.env.GMAIL_USER}>`, 
                  
                    // from: `"Sadhana Team" <${process.env.GMAIL_USER}>`, 
                    to: toAddress,
                    subject: subject,
                    html: html,
                };
                
                if (attachment) {
                    mailOptions.attachments = [{
                        filename: attachment.filename, 
                        path: attachment.path, 
                        contentType: attachment.contentType
                    }];
                }

                await transporter.sendMail(mailOptions);
                console.log(`✅ Email natively sent via Gmail to ${toAddress}`);
                // BUG FIXED: Removed the "return true" that was causing the infinite lock
                
            } catch (error) {
                console.error(`❌ Failed to send email to ${toAddress}:`, error.message);
            }

            // Gmail Bulk Throttle: Forces a safe 1-second pause between EVERY email
            // This prevents Google from blocking you for TCP spamming.
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Properly relinquishes the lock when the array is finally empty
        this.isProcessing = false; 
    }
}

export default new EmailQueue();
