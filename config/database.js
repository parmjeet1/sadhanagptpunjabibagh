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
        connectionLimit    : 50,
        connectTimeout     : 30000,
        maxIdle            : 5,       // keep at most 5 idle connections open
       idleTimeout        : 60000,   // close idle connections after 60 s, which frees MySQL RAM
       enableKeepAlive    : true,
    
});


export default db;
