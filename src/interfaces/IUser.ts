// interfaces/IUser.ts
import { Document } from "mongoose";

// Define role types
export type UserRole = "admin" | "teacher" | "staff" | "student" | "parent";

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

interface IPasswordReset {
  code: string | null;
  expiresAt: Date | null;
}

interface IEmailVerification {
  code: string | null;
  expiresAt: Date | null;
  isVerified: boolean;
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
  emailVerification: IEmailVerification;
  passwordReset: IPasswordReset;
  createdAt: Date;
  updatedAt: Date;
}
