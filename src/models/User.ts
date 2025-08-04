// models/User.ts
import { Schema, model } from "mongoose";
import { IUser, UserRole } from "../interfaces/IUser";
import bcrypt from "bcryptjs";

const UserSchema = new Schema<IUser>(
  {
    fullname: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super-admin", "admin", "user"],
      // default: "user",
    },
    recordCounts: {
      totalRegular: { type: Number, default: 0 },
      totalNatural: { type: Number, default: 0 },
      dailyRegular: { type: Number, default: 0 },
      dailyNatural: { type: Number, default: 0 },
      deletedRegular: { type: Number, default: 0 },
      deletedNatural: { type: Number, default: 0 },
      lastRegularCountDate: { type: Date, default: null },
      lastNaturalCountDate: { type: Date, default: null },
    },
    suspended: { type: Boolean, default: false },
    updatedPersonalInfo: {
      type: Boolean,
      default: false,
    },
    signedWaiver: {
      type: Boolean,
      default: false,
    },
    personalInfo: {
      age: { type: Number },
      gender: { type: String },
      nationality: { type: String },
      state: { type: String },
      phoneNumber: { type: String },
      occupation: { type: String },
      dialect: { type: String },
    },
    bankDetails: {
      bankName: { type: String },
      accountName: { type: String },
      accountNumber: { type: String },
    },
    languages: [String],
    emailVerification: {
      code: String,
      expiresAt: Date,
      isVerified: { type: Boolean, default: false },
    },
    passwordReset: {
      code: String,
      expiresAt: Date,
    },
  },
  {
    timestamps: true,
    discriminatorKey: "role",
  }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

UserSchema.methods.matchPassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = model<IUser>("User", UserSchema);
