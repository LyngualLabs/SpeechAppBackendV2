import dotenv from 'dotenv';
dotenv.config();

interface Environment {
  NODE_ENV: string;
  PORT: number;
  MONGO_URI: string;
  JWT_SECRET: string;
}

export const env: Environment = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/mern-typescript',
  JWT_SECRET: process.env.JWT_SECRET || 'default_secret_change_this'
};