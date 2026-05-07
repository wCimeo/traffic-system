import path from 'path';
import dotenv from 'dotenv';

const ROOT_ENV_PATH = path.resolve(__dirname, '../../.env');
const BACKEND_ENV_PATH = path.resolve(__dirname, '../.env');

dotenv.config({ path: ROOT_ENV_PATH });
dotenv.config({ path: BACKEND_ENV_PATH });
