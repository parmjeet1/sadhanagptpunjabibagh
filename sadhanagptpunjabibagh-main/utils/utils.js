// import NodeCache from "node-cache";
import axios from "axios";
import path from 'path';
// import puppeteer from 'puppeteer';
import ejs from 'ejs';
import { insertRecord, queryDB } from "./dbUtils.js";
import { GoogleAuth } from "google-auth-library";
import { fileURLToPath } from 'url';
// import fs from 'fs';
import dotenv from 'dotenv';
import db from "../config/database.js";
dotenv.config();
import moment from "moment-timezone";
import { NOTIFICATION_CONTENT } from "../SadhanaGPT/Controllers/notificationContent.js";
// import { deleteImageFromS3 } from "./fileUpload.js";
// import QRCode  from 'qrcode';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function mergeParam(req) {
  return { ...req.query, ...req.body };
};

export const generateRandomPassword = (length = 8) => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  return password;
};

export const checkNumber = (countryCode, num) => {
  const numArr = [
    { code: "+91", startWith: [6, 7, 8, 9], length: 10 }
      ];

  const entry = numArr.find((item) => item.code === countryCode);

  if (entry) {
    const first = Number(num.charAt(0));
    const isValidStart = entry.startWith.includes(first);
    const isValidLength = num.length === entry.length;

    if (!isValidStart) {
      return { status: 0, msg: `Mobile Number Must start with ${entry.startWith.join(", ")}` };
    }
    if (!isValidLength) {
      return { status: 0, msg: `No should be ${entry.length} digits` };
    }
    return { status: 1, msg: "No is valid!" };
  }
  return { status: 0, msg: "The number you entered is not correct. Please provide a valid number." };
};

export const generateOTP = (length) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
};


const formatTime = (timeStr) => {
  const [hour, minute, second] = timeStr.split(':').map(Number);
  const isPM = hour >= 12;
  const adjustedHour = hour % 12 === 0 ? 12 : hour % 12;
  const period = isPM ? 'PM' : 'AM';

  return `${adjustedHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
};

export const formatOpenAndCloseTimings = (alwaysOpen, data) => {
  if (!alwaysOpen) return { fDays: '', fTiming: '' };

  const fDays = data.days.join('_');

  const timeArr = data.days.map(day => {
      const openTime = data[`${day}_open_time`];
      const closeTime = data[`${day}_close_time`];

      if (openTime && closeTime) {
          const formattedOpenTime = new Date(`1970-01-01T${openTime}`).toTimeString().slice(0, 8);
          const formattedCloseTime = new Date(`1970-01-01T${closeTime}`).toTimeString().slice(0, 8);
          return `${formattedOpenTime}-${formattedCloseTime}`;
      } else {
          return 'Closed';
      }
  });

  const fTiming = timeArr.join('_');

  return { fDays, fTiming };
};

/* convert  time */
export const convertTo24HourFormat = (timeStr) => {
  const [time, modifier] = timeStr.split(' '); 
  let [hours, minutes] = time.split(':');

  hours = String(hours); 

  if (modifier === 'PM' && hours !== '12') {
      hours = (parseInt(hours, 10) + 12).toString(); 
  }

  if (modifier === 'AM' && hours === '12') {
      hours = '00'; // Convert 12 AM to 00 hours
  }

  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`; 
};

/* Amount Number To Word Converter */
export function numberToWords(num) {
  const ones = [
      "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE",
      "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN",
      "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN",
      "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"
  ];

  const tens = [
      "ZERO", "TEN", "TWENTY", "THIRTY", "FORTY",
      "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"
  ];

  const hundreds = [
      "HUNDRED", "THOUSAND", "MILLION", "BILLION", "TRILLION", "QUARDRILLION"
  ];

  num = Number(num).toFixed(2);
  const numParts = num.split(".");
  const wholeNum = numParts[0];
  const decNum = numParts[1];

  const wholeArr = Array.from(wholeNum).reverse().join('').split(/(?=(?:\d{3})+$)/g).reverse();
  let resultText = "";

  for (let key = 0; key < wholeArr.length; key++) {
      let i = wholeArr[key].replace(/^0+/, '');

      if (i.length === 0) continue;

      if (i < 20) {
          resultText += ones[parseInt(i)];
      } else if (i < 100) {
          resultText += tens[Math.floor(i / 10)];
          if (i % 10 > 0) resultText += " " + ones[i % 10];
      } else {
          resultText += ones[Math.floor(i / 100)] + " " + hundreds[0];
          const remainder = i % 100;
          if (remainder > 0) {
              if (remainder < 20) {
                  resultText += " " + ones[remainder];
              } else {
                  resultText += " " + tens[Math.floor(remainder / 10)];
                  if (remainder % 10 > 0) resultText += " " + ones[remainder % 10];
              }
          }
      }

      if (key > 0) {
          resultText += " " + hundreds[key] + " ";
      }
  }

  if (decNum > 0) {
      resultText += " UAE Dirhams and ";
      if (decNum < 20) {
          resultText += ones[parseInt(decNum)];
      } else {
          resultText += tens[Math.floor(decNum / 10)];
          if (decNum % 10 > 0) resultText += " " + ones[decNum % 10];
      }
      resultText += " Fils Only";
  } else {
      resultText += " UAE Dirhams Only";
  }

  return resultText.replace("Uae", "UAE").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/* Format Number */
export function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
  }).format(value);
};

export const sendNotification = async (
  type,
  payload = {},
  created_by ,
  receive_id
  
) => {
  try {
    const template = NOTIFICATION_CONTENT[type];
    if (!template) {
      throw new Error(`Notification type "${type}" not found`);
    }

    const heading = typeof template.heading === "function"
        ? template.heading(payload)
        : template.heading;

    const desc =
      typeof template.desc === "function"
        ? template.desc(payload)
        : template.desc;

    const href =
      typeof template.href === "function"
        ? template.href(payload)
        : template.href;

        console.log(heading, desc,  template.module_name, template.panel_to, template.panel_from, user_id, href)

         const result = await insertRecord('notifications', [
    'heading', 'description', 'module_name', 'panel_to', 'panel_from', 'created_at',receive_id, 'href'
  ],[
    heading, desc,  template.module_name, template.panel_to, template.panel_from, created_by,receive_id, href
  ]);

console.log("notification sent")

    return result.affectedRows > 0 ?true:false;
  } catch (err) {
    console.error("sendNotification error:", err.message);
    return false;
  }
};

/* Create Notification */
export const createNotification = async (heading, desc, module_name, panel_to, panel_from, created_by, receive_id, href_url='') => {
  const result = await insertRecord('notifications', [
    'heading', 'description', 'module_name', 'panel_to', 'panel_from', 'created_by', 'receive_id', 'status', 'href_url'
  ],[
    heading, desc, module_name, panel_to, panel_from, created_by, receive_id, '0', href_url
  ]);

  return {
    affectedRows: result.affectedRows
  };
};

/* Send Notification */
// const getAccessToken = async (fcmType) => {
//   try {
//     const fileName = (fcmType === 'RSAFCM') ? 'plusx-support-firebase.json' : 'plusx-electric-firebase.json';
//     const serviceAccountPath = path.join(__dirname, 'public/firebase-files/', fileName);

//     const auth = new GoogleAuth({
//         keyFilename: serviceAccountPath,
//         scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
//     });
//     const client = await auth.getClient();
//     const accessTokenResponse = await client.getAccessToken();
//     const accessToken = accessTokenResponse.token;

//     return accessToken;
// } catch (error) {
//     console.error('Error fetching access token:', error.message);
//     throw error;
// }
// };
const getAccessToken = async () => {
  try {
    const fileName = 'sadhanagptfirebase.json';
    const serviceAccountPath = path.join(__dirname, 'config/firebase-files/', fileName);

    const auth = new GoogleAuth({
        keyFilename: serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    return accessToken;
} catch (error) {
    console.error('Error fetching access token:', error.message);
    throw error;
}
};

export const pushNotification = async ( deviceToken, title, body, clickAction ) => {
    try {
        const accessToken      = await getAccessToken();
        const clickActionParts = clickAction ? clickAction.split("/") : [];
        
        const notification = {
          title: title,
          body: body,
        };
        const data = {
          title: title,
          body: body,
          click_action: clickActionParts[0],
          refrence_id: clickActionParts[1],
        };
        
        const message = {
          message: {
            token: deviceToken,
            notification: notification,
            data: data,
            apns: {
              payload: {
                aps: {
                  sound: "default",
                },
              },
            },
            android: {
              priority: "high",
              // notification: {
              //   click_action: clickActionParts[0],
              // },
            },
          },
        };        

        const projectId = 'sadhanagpt-53e37';
        const url       = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
        const response  = await axios.post(url, message, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        // console.log('Notification sent successfully:', message);
    } catch (error) {
        console.error('Error sending notification:', error.response ? error.response.data : error.message);
    }
};

/* Fromat Date Time in Sql Query */
export const formatDateTimeInQuery = (columns) => {
  return columns.map(column => {
      if (column.includes('.')) {
        const alias = column.split('.').pop();
        return `DATE_FORMAT(CONVERT_TZ(${column}, 'UTC', 'Asia/Dubai'), '%Y-%m-%d %H:%i:%s') AS ${alias}`;
      } else {
        return `DATE_FORMAT(CONVERT_TZ(${column}, 'UTC', 'Asia/Dubai'), '%Y-%m-%d %H:%i:%s') AS ${column}`;
      }
  }).join(', ');
};

export const formatDateInQuery = (columns) => {
  return columns.map(column => {
      if (column.includes('.')) {
        const alias = column.split('.').pop();
        return `DATE_FORMAT(CONVERT_TZ(${column}, 'UTC', 'Asia/Dubai'), '%Y-%m-%d') AS ${alias}`;
      } else {
        return `DATE_FORMAT(CONVERT_TZ(${column}, 'UTC', 'Asia/Dubai'), '%Y-%m-%d') AS ${column}`;
      }
  }).join(', ');
};

/* Helper to delete a image from uploads/ */
export const deleteFile = (directory, filename) => {
    
    const oldImagePath = path.join(process.env.S3_FOLDER_NAME, directory, filename || '').replace(/\\/g, '/');
    deleteImageFromS3(oldImagePath);  

    // const file_path = path.join('uploads', directory, filename);
    // if(file_path){
    //     fs.unlink(file_path, (err) => {
    //         if (err) console.error(`Failed to delete ${directory} image ${filename}:`, err);
    //     });
    // } else {
    //     console.log('File does not exist.');
    // }
};

export const asyncHandler = (fn) => {
  return function (req, res, next) {
      fn(req, res, next).catch(next);
  };
};

/* Generates a PDF from an EJS template. - M1 Not supported using puppeter */

export const generatePdf = async (templatePath, invoiceData, fileName, savePdfDir, req) => {
  try {
    const html = await ejs.renderFile(templatePath, { ...invoiceData });
    // const serverUrl = `https://plusx.shunyaekai.com/web/upload-pdf`;
    const serverUrl = `${req.protocol}://${req.get('host')}/web/upload-pdf`;       
    
    const response = await axios.post('http://supro.shunyaekai.tech:8801/pdf-api.php', {  //http://supro.shunyaekai.tech:8801/pdf-api.php
      html,
      fileName,
      serverUrl,
      savePdfDir
    }, { 
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.data.success) {
    //   console.log('PDF generated successfully:');
      return { success: true , pdfPath: response.data.php_response.pdfPath} ;
    }
  } catch (error) {
    console.error('Error generating PDF _from_utils:', error);
    return { success: false, error };
  }
};


export const checkCoupon = async (rider_id, booking_type, coupon_code, bookingPrice=0) => {
    
    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM coupon WHERE coupan_code = ?',[coupon_code]);
    if (count === 0) return { status: 0, code: 422, message : 'The coupon you entered is not valid.' };

    const coupon = await queryDB(`
        SELECT
            coupan_percentage, end_date, user_per_user, status, booking_for, 
            (SELECT count(id) FROM coupon_usage AS cu WHERE cu.coupan_code = coupon.coupan_code AND user_id = ?) as use_count
        FROM 
            coupon
        WHERE 
            coupan_code = ?
        LIMIT 1
    `, [rider_id, coupon_code]); 

    if (moment(coupon.end_date).isBefore(moment(), 'day') || coupon.status < 1){
        return { status: 0, code: 422, message : "The coupon you entered has expired."} ;

    } else if(coupon.booking_for != booking_type){
        return { status: 0, code: 422, message : "The coupon code entered is not valid. Please check and try again."};

    } else if(coupon.use_count >= coupon.user_per_user){
        return { status: 0, code: 422, message : "This coupon code has already been used the maximum number of times."} ;
    }
    var amount;
    if( bookingPrice ) {
        amount = bookingPrice;

    } else {
        const priceQry = `SELECT portable_price, pick_drop_price, roadside_assistance_price, portable_price, pick_drop_price FROM booking_price LIMIT 1`;
        const priceData = await queryDB(priceQry, []);
        amount = (booking_type == 'Valet Charging') ? priceData.pick_drop_price : priceData.portable_price ;
    }
    // const priceQry  = `SELECT portable_price, pick_drop_price, roadside_assistance_price, portable_price, pick_drop_price FROM booking_price LIMIT 1`;
    // const priceData = await queryDB(priceQry, []);
    // const amount = (booking_type == 'Valet Charging') ? priceData.pick_drop_price : (booking_type == 'Roadside Assistance') ? priceData.roadside_assistance_price : priceData.portable_price ;
     
    const data = {}; 
    if ( coupon.coupan_percentage != parseFloat(100) ) {
        const dis_price = ( amount  * coupon.coupan_percentage ) /100;
        const total_amt = amount - dis_price;
        
        const vat_amt  = Math.floor(( total_amt ) * 5) / 100;
        data.total_amt = total_amt + vat_amt;

    } else {
        const vat_amt  = Math.floor(( amount ) * 5) / 100;
        const total_amt = parseFloat(amount) + parseFloat( vat_amt ); 
        const dis_price = ( total_amt * coupon.coupan_percentage)/100;
        
        data.total_amt  = total_amt - dis_price;
    }
    const finalAmount = data.total_amt;

    return {
        service_price : Math.floor( parseFloat(finalAmount) * 100 ), 
        amount, 
        message       : 'Your discount has been successfully applied. Enjoy the savings!',
        status        : 1,
        code          : 200
    };
};
// Get Route Map Single or Multiple
export const getSingleRoute = async (origin, destination) => {
    const apiKey = process.env.Google_map_key;

    // const origin      = '24.9998332,55.1217449';    // Bangalore
    // const destination = '25.213799,55.31758357892679';   // Chennai

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${apiKey}`;

    try {
        const response = await axios.get(url);
        const data     = response.data;

        if (data.status === 'OK') {
            const route = data.routes[0];
            const leg   = route.legs[0];

            // Optional: Return for frontend
            return {
                distance : leg.distance.text,
                // duration : leg.duration.text,
                // polyline : route.overview_polyline.points,
                // mapUrl   : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`,
            };
        } else {
            console.error('Google API error:', data.status);
            return {err : data.status} ;
        }
    } catch (err) {
        console.error('Request failed:', err.message);
        return  {err : data.status} ;
    }
};
export const getMultipleRoute = async (origin, destinations) => {
    const apiKey  = process.env.Google_map_key;
    const destStr = destinations.map(d => `${d.latitude},${d.longitude}`).join('|');
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destStr}&key=${apiKey}`;
    const res = await axios.get(url);

    res.data.rows[0]?.elements.forEach((element, index) => {

        if (element.status === 'OK') {
            destinations[index].distance = parseFloat(element.distance.text);
            destinations[index].duration = element.duration.text;
        }
    });
    return destinations;
}
export const  ResponseData=(resp,status, code, message, data = {})=> {
    if (typeof message === 'string') {
        message = [message];
    }
    return resp.json({
        status,
        code,
        message,
        ...data
    });
}


// export const oldcallDatabase=async(db)=>{
//   if(!req.db){ console.log("db required")} const db=req.db;
//   console.log("databse selected ")
//    return req.db;
// }
export const callDatabase = async(reqConnection) => {
  if (!reqConnection) {
    console.log(" DB required");
    throw new Error("Database not selected");
  }
  console.log(" Database selected");
  return reqConnection;
};



export const oldgenerateQRCode = async (text) => {
  try {
    const qrImageBase64 = await QRCode.toDataURL(text);
    console.log(qrImageBase64); // base64 string
    return qrImageBase64;
  } catch (err) {
    console.error('Failed to generate QR code:', err);
  }
};


export const generateQRCode = async (text) => {
  try {
    const qrImageBase64 = await QRCode.toDataURL(text);
    // console.log(" QRCODE : ",qrImageBase64); // base64 string
    // handleFileUpload('qr-codes', ['cover_image'])
    return qrImageBase64;
  } catch (err) {
    console.error('Failed to generate QR code:', err);
  }
};

export function generateRandomCode(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}


export function normalizeSchedule(station) {
    const allDays = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

    const openDays = (station.open_days || "").split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

    const timingSlots = (station.open_timing || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    const finalTimings = allDays.map((day, i) => {
      const idx = openDays.indexOf(day);
      if (idx !== -1 && timingSlots[idx]) {
        return timingSlots[idx];   // one slot for that day
      }
      return "closed";
    });

    return {
      open_days: allDays,
      open_timing: finalTimings
    };
}

function minutesToTime(mins) {
  const hrs = Math.floor(mins / 60);
  const minsPart = mins % 60;
  const period = hrs >= 12 ? 'PM' : 'AM';
  const hour12 = hrs % 12 === 0 ? 12 : hrs % 12;
  return `${hour12}:${String(minsPart).padStart(2, '0')} ${period}`;
}
const otpStore = new Map();
    export const saveOtp = (email, otp) => {
        const expiresAt = Date.now() + 10 * 60 * 1000; // 5 minutes TTL
        otpStore.set(email, { otp, expiresAt });
    };
    export const verifyOtp = (email, otp) => {
        const data = otpStore.get(email);
        if (!data) return false;
        
        if (Date.now() > data.expiresAt) {
            otpStore.delete(email);
            return false;
        }
        
        const isValid = data.otp === otp;
        if (isValid) {
            otpStore.delete(email); // Use once and discard
        }
        return isValid;
    };