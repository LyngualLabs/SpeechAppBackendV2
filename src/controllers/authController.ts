import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { IUser } from "../interfaces/IUser";
import emailjs, { EmailJSResponseStatus } from "@emailjs/nodejs";

const generateToken = (id: string) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: "1d",
  });
};

let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/;

interface IAuthRequest extends Request {
  user?: {
    _id: string;
  };
}

export const signUp = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const { fullname, email, password } = req.body;
    console.log("Request body:", req.body);
    try {
      if (!req.body) {
        return res.status(400).json({ message: "Request body is missing" });
      }
      if (!emailRegex.test(email)) {
        return res.status(403).json({ message: "Email is Invalid" });
      }
      if (!passwordRegex.test(password)) {
        return res.status(403).json({
          message:
            "Password should be 6-20 characters, with a numeric, 1 lowercase and 1 uppercase letter",
        });
      }

      const userExists = await User.findOne({ email });

      if (userExists) {
        return res.status(400).json({ message: "User already exists" });
      }

      const user = await User.create({
        fullname,
        email,
        password,
        role: "user", // Default role
      });

      const responseData = {
        success: true,
        fullname: user.fullname,
        email: user.email,
      };

      res.status(201).json(responseData);
    } catch (err) {
      res.status(500).json({ message: "An error occurred" });
      console.log(err);
    }
  }
);

export const signIn = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const { email, password } = req.body;
    try {
      const user = (await User.findOne({ email })) as
        | (IUser & { _id: any })
        | null;

      if (!user) {
        return res
          .status(403)
          .json({ message: "No User with that Email Address" });
      }

      // Check if password is correct
      const passwordIsCorrect = await bcrypt.compare(password, user.password);
      if (!passwordIsCorrect) {
        return res.status(400).json({ message: "Invalid email or password" });
      }
      // Generate Token
      const token = generateToken(user._id.toString());

      // Dynamic cookie settings based on environment
      const isProduction = process.env.NODE_ENV === "production";

      // Properly detect HTTPS behind proxy
      const isSecure =
        req.secure || req.headers["x-forwarded-proto"] === "https";

      // Log environment details
      console.log("Environment:", process.env.NODE_ENV);
      console.log("Request protocol:", req.protocol);
      console.log("Request secure:", req.secure);
      console.log("X-Forwarded-Proto:", req.headers["x-forwarded-proto"]);

      const cookieOptions = {
        path: "/",
        httpOnly: true,
        expires: new Date(Date.now() + 1000 * 86400), // 1 day
        sameSite:
          isProduction && isSecure ? ("none" as "none") : ("lax" as "lax"),
        secure: isProduction && isSecure, // Only secure in production (HTTPS)
      };

      res.cookie("token", token, cookieOptions);

      const responseData = {
        success: true,
        fullname: user.fullname,
        email: user.email,
        role: user.role || "user",
        token: token,
      };

      res.status(200).json(responseData);
    } catch (err) {
      res.status(500).json({ message: "Server Error" });
      console.log(err);
    }
  }
);

export const getAuthStatus = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    try {
      // Get token from cookie
      const token = req.cookies.token;
      console.log(token);

      if (!token) {
        return res.status(401).json({
          success: false,
          isAuthenticated: false,
          message: "Not authenticated token",
        });
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };

      // Get user (exclude password)
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          isAuthenticated: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        isAuthenticated: true,
        user: {
          fullname: user.fullname,
          email: user.email,
        },
      });
    } catch (error) {
      console.log(error);
      return res.status(401).json({
        success: false,
        isAuthenticated: false,
        message: "Invalid authentication--",
      });
    }
  }
);

export const getUser = asyncHandler(
  async (req: IAuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?._id) {
        res.status(401).json({
          success: false,
          message: "Not authorized",
        });
        return;
      }

      const user = await User.findById(req.user._id).select("-password");

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      let token;
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      const responseData = {
        success: true,
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: user.role || "user",
        personalInfo: user.personalInfo || null,
        languages: user.languages || [],
        token: req.cookies.token || token || null,
      };

      res.status(200).json(responseData);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }
);

export const sendVerificationCode = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const email = req.params.email;
    console.log("Email for verification:", email);

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res
          .status(403)
          .json({ message: "No User with that Email Address" });
      }

      // Generate 4-digit verification code
      const code = Math.floor(1000 + Math.random() * 9000).toString();

      // Update user with verification code and expiration
      user.emailVerification.code = code;
      user.emailVerification.expiresAt = new Date(Date.now() + 3600000);
      user.emailVerification.isVerified = false;
      await user.save();

      const templateParams = {
        email: user.email,
        fullname: user.fullname,
        code: code,
      };

      try {
        await emailjs.send(
          process.env.EMAILJS_SERVICE_ID as string,
          process.env.EMAILJS_VERIFY_EMAIL_TEMPLATE as string,
          templateParams,
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY as string,
            privateKey: process.env.EMAILJS_PRIVATE_KEY as string,
          }
        );

        res.status(200).json({
          success: true,
          message: "Verification code sent to Email Address",
        });
      } catch (err) {
        if (err instanceof EmailJSResponseStatus) {
          console.error("EMAILJS FAILED...", err);
          return res.status(500).json({
            success: false,
            message:
              "Failed to send verification email. Please try again later.",
            details: err.text,
          });
        }

        console.error("EMAIL ERROR", err);
        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
      }
    } catch (err) {
      console.error("Server error:", err);
      res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }
);

export const verifyEmailCode = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const { email, code } = req.body;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if code exists and hasn't expired
      if (
        !user.emailVerification.code ||
        !user.emailVerification.expiresAt ||
        new Date() > user.emailVerification.expiresAt
      ) {
        return res.status(400).json({
          success: false,
          message: "Verification code has expired",
        });
      }

      // Check if code matches
      if (user.emailVerification.code !== code) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification code",
        });
      }

      // Mark email as verified and clear verification data
      user.emailVerification.isVerified = true;
      user.emailVerification.code = null;
      user.emailVerification.expiresAt = null;
      await user.save();

      res.status(200).json({
        success: true,
        message: "Email verified successfully",
      });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }
);

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const email = req.params.email;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(403).json({
          success: false,
          message: "No User with that Email Address",
        });
      }

      // Generate 4-digit reset code
      const code = Math.floor(1000 + Math.random() * 9000).toString();

      // Update user with reset code and expiration
      user.passwordReset.code = code;
      user.passwordReset.expiresAt = new Date(Date.now() + 3600000); // 1 hour
      await user.save();

      const templateParams = {
        email: user.email,
        fullname: user.fullname,
        code: code,
      };

      try {
        await emailjs.send(
          process.env.EMAILJS_SERVICE_ID as string,
          process.env.EMAILJS_FORGOT_PASSWORD_TEMPLATE as string,
          templateParams,
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY as string,
            privateKey: process.env.EMAILJS_PRIVATE_KEY as string,
          }
        );

        res.status(200).json({
          success: true,
          email: user.email,
          message: "Reset Code sent to email address",
        });
      } catch (err) {
        if (err instanceof EmailJSResponseStatus) {
          console.error("EMAILJS FAILED...", err);
          return res.status(500).json({
            success: false,
            message:
              "Failed to send password reset email. Please try again later.",
            details: err.text,
          });
        }

        console.error("EMAIL ERROR", err);
        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
      }
    } catch (err) {
      console.error("Server error:", err);
      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  }
);

export const verifyResetCode = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const { email, code } = req.body;
   

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Please enter reset code",
        });
      }

      // Check if code exists and hasn't expired
      if (
        !user.passwordReset.code ||
        !user.passwordReset.expiresAt ||
        new Date() > user.passwordReset.expiresAt
      ) {
        return res.status(400).json({
          success: false,
          message: "Reset code has expired",
        });
      }

      if (user.passwordReset.code !== code) {
        return res.status(400).json({
          success: false,
          message: "Invalid reset code",
        });
      }

      // Clear the reset code but keep the expiration for password reset
      user.passwordReset.code = null;
      await user.save();

      res.status(200).json({
        success: true,
        email: user.email,
        message: "Code verified. Proceed to reset password",
      });
    } catch (err) {
      console.error("Verification error:", err);
      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  }
);

export const resetPassword = asyncHandler(
  async (req: Request, res: Response): Promise<any> => {
    const { password } = req.body;
    const email = req.params.email;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Please enter new password",
        });
      }

      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          success: false,
          message:
            "Password should be 6-20 characters, with a numeric, 1 lowercase and 1 uppercase letter",
        });
      }

      // Check if reset session is still valid (within 1 hour of code verification)
      if (
        !user.passwordReset.expiresAt ||
        new Date() > user.passwordReset.expiresAt
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Password reset session has expired. Please request a new reset code.",
        });
      }

      // Update the user's password (will be hashed by pre-save middleware)
      user.password = password;
      // Clear password reset data
      user.passwordReset.code = null;
      user.passwordReset.expiresAt = null;
      await user.save();

      res.status(200).json({
        success: true,
        message:
          "Password reset successful. Please login with your new password.",
      });
    } catch (err) {
      console.error("Password reset error:", err);
      res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  }
);
