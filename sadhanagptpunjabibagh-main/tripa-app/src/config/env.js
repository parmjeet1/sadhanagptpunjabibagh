import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the path to tripa-app/.env
const envPath = path.resolve(__dirname, '../../.env');

let tripaEnv = {};
try {
  const envFile = fs.readFileSync(envPath);
  tripaEnv = dotenv.parse(envFile);
} catch (error) {
  console.warn(`[Tripa] Warning: Could not read .env file at ${envPath}. Falling back to empty configuration.`);
}

export default tripaEnv;
