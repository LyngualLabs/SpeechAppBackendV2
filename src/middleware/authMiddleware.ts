import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { User } from "../models/User";
import { IAuthRequest } from "../interfaces/IAuthRequest";

export const protect = asyncHandler(
  async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies.token;
      console.log("authToken", token);

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
      res.status(401).json({
        success: false,
        message: "Not authorized, invalid token",
      });
    }
  }
);
