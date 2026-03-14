import mysql from 'mysql2/promise';
import dotenv from 'dotenv';


dotenv.config();
const db = mysql.createPool({
        host               : process.env.DB_HOST,
        user               : process.env.DB_USERNAME,
        password           : process.env.DB_PASSWORD,
        database           : process.env.DB_NAME,
        port               : process.env.DB_PORT,
        waitForConnections : true,
         ssl: {
    rejectUnauthorized: true
  }
        // queueLimit         : 0
    // connectTimeout     : 10000,
});

console.log("india databse")
export default db;
