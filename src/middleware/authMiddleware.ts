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
      }

      // If no token in header, try to get from cookies
      if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
      }

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

     
      req.user = user;
      next();
    } catch (error) {
      console.log("Token verification error: ", error);
      res.status(401).json({
        success: false,
        message: "Not authorized, invalid token",
      });
    }
  }
);
