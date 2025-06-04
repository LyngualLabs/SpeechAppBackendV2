// interfaces/IUser.ts
import { Document } from 'mongoose';

// Define role types
export type UserRole = 'admin' | 'teacher' | 'staff' | 'student' | 'parent';

// Define personal information interface
export interface IPersonalInfo {
  phoneNumber: string;
  gender: string;
  nationality: string;
  state: string;
  age: number;
  occupation: string;
}

// Define bank details interface
export interface IBankDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

// Define main user interface
export interface IUser extends Document {
  fullname: string;
  email: string;
  password: string;
  role: UserRole;
  personalInfo: IPersonalInfo;
  bankDetails: IBankDetails;
  languages: string[];
  createdAt: Date;
  updatedAt: Date;
}