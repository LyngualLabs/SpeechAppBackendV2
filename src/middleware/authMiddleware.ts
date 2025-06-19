import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { User } from "../models/User";
import { IAuthRequest } from "../interfaces/IAuthRequest";

export const protect = asyncHandler(
  async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
      let token;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
        console.log("Token found in Authorization header");
      }

      // If no token in header, try to get from cookies
      if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
        console.log("Token found in cookies");
      }

      console.log("Authorization header:", authHeader);
      console.log(
        "Extracted token:",
        token ? `${token.substring(0, 20)}...` : "None"
      );

      if (!token) {
        res.status(401).json({
          success: false,
          message: "Not authorized, no token",
        });
        return;
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
      };

      // Get user from token
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (error) {
      console.log("Token verification error:", error);
      res.status(401).json({
        success: false,
        message: "Not authorized, invalid token",
      });
    }
  }
);
