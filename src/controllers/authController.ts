import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { IUser } from "../interfaces/IUser";

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
