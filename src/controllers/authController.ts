import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
// import { IUser } from "../interfaces/IUser";

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
      const user = await User.findOne({ email });

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

      // Send HTTP-only cookie
      res.cookie("token", token, {
        path: "/",
        httpOnly: true,
        expires: new Date(Date.now() + 1000 * 86400), // 1 day
        sameSite: "none",
        secure: true,
      });

      const responseData = {
        success: true,
        fullname: user.fullname,
        email: user.email,
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
