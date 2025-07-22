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
  dailyRegularCount: number;
  lastRegularCountDate: Date | null;
  dailyNaturalCount: number;
  lastNaturalCountDate: Date | null;
  deletedRegularRecordingsCount: number;
  deletedNaturalRecordingsCount: number;
  recordCounts: {
    totalRegular: number;
    totalNatural: number;
    dailyRegular: number;
    dailyNatural: number;
    deletedRegular: number;
    deletedNatural: number;
    lastRegularCountDate: Date | null;
    lastNaturalCountDate: Date | null;
  };
  suspended: boolean;
  updatedPersonalInfo: boolean;
  signedWaiver: boolean;
  personalInfo: IPersonalInfo;
  bankDetails: IBankDetails;
  languages: string[];
  emailVerification: IEmailVerification;
  passwordReset: IPasswordReset;
  createdAt: Date;
  updatedAt: Date;
}
