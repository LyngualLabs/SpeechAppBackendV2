// interfaces/IUser.ts
import { Document } from 'mongoose';

// Define base user interface
export interface IUser {
  email: string;
  password: string;
  role: UserRole;
  fullname: string;
  phone: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Define role types
export type UserRole = 'admin' | 'teacher' | 'staff' | 'student' | 'parent';
