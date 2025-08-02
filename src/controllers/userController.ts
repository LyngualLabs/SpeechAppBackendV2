import { Request, Response } from "express";
import { User } from "../models/User";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { RegularRecording } from "../models/RegularRecordings";
import { NaturalRecording } from "../models/NaturalRecordings";
import { IUser } from "../interfaces/IUser";

interface AuthRequest extends Request {
  user?: {
    _id: string;
    fullname: string;
  };
}

export const getMyDetails = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?._id;

      if (!userId) {
        res.status(401).json({ message: "Not authorized" });
        return;
      }

      const user = await User.findById(userId).select("-password");

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const regularRecordingsCount = await RegularRecording.countDocuments({
        user: userId,
      });
      const naturalRecordingsCount = await NaturalRecording.countDocuments({
        user: userId,
      });

      res.status(200).json({
        success: true,
        data: {
          id: user._id,
          fullname: user.fullname,
          email: user.email,
          role: user.role,
          suspended: user.suspended,
          updatedPersonalInfo: user.updatedPersonalInfo,
          signedWaiver: user.signedWaiver,
          emailVerified: user.emailVerification?.isVerified || false,
          personalInfo: user.personalInfo,
          bankDetails: user.bankDetails,
          languages: user.languages,
          recordCounts: user.recordCounts,
        },
      });
    } catch (err) {
      console.error("Error fetching user details:", err);
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  }
);

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.aggregate([
      {
        $lookup: {
          from: "regularrecordings",
          localField: "_id",
          foreignField: "user",
          as: "regularRecordings",
        },
      },
      {
        $lookup: {
          from: "naturalrecordings",
          localField: "_id",
          foreignField: "user",
          as: "naturalRecordings",
        },
      },
      {
        $project: {
          id: "$_id",
          fullname: 1,
          email: 1,
          role: 1,
          suspended: 1,
          "personalInfo.gender": 1,
          regularRecordingsCount: { $size: "$regularRecordings" },
          naturalRecordingsCount: { $size: "$naturalRecordings" },
          totalRecordingsCount: {
            $add: [
              { $size: "$regularRecordings" },
              { $size: "$naturalRecordings" },
            ],
          },
          _id: 0,
        },
      },
    ]);

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

export const getUserById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: "User ID is required",
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
        return;
      }

      const user = await User.findById(userId).select("-password");

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      const regularRecordingsCount = await RegularRecording.countDocuments({
        user: userId,
      });

      const naturalRecordingsCount = await NaturalRecording.countDocuments({
        user: userId,
      });

      const verifiedRegularCount = await RegularRecording.countDocuments({
        user: userId,
        isVerified: true,
      });

      const verifiedNaturalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: true,
      });

      res.status(200).json({
        success: true,
        data: {
          id: user._id,
          fullname: user.fullname,
          email: user.email,
          role: user.role,
          suspended: user.suspended,
          personalInfo: user.personalInfo,
          recordingStats: {
            totalRecordings:
              user.recordCounts?.totalRegular + user.recordCounts?.totalNatural,
            totalDeleted:
              user.recordCounts?.deletedRegular +
              user.recordCounts?.deletedNatural,
            currentRecordings: regularRecordingsCount + naturalRecordingsCount,
            totalVerified: verifiedRegularCount + verifiedNaturalCount,
          },
        },
      });
    } catch (err) {
      console.error("Error fetching user details:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user details",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: "User already exists" });
      return;
    }

    // Create new user
    const newUser = new User({
      name,
      email,
      password,
    });

    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

export const toggleUserSuspension = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ message: "User ID is required" });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { suspended: !user.suspended },
      { new: true }
    );

    res.status(200).json({
      message: `User ${
        updatedUser?.suspended ? "suspended" : "unsuspended"
      } successfully`,
    });
  }
);

export const signWaiver = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?._id;

    try {
      if (!userId) {
        res.status(401).json({ message: "Not authorized" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      user.signedWaiver = true;
      await user.save();

      res.status(200).json({
        message: "User signed waiver successfully",
      });
    } catch (err) {
      console.error("Error signing waiver:", err);
      res.status(500).json({ message: "Failed to sign waiver" });
    }
  }
);

export const updateDetails = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?._id;
    const {
      phoneNumber,
      gender,
      nationality,
      state,
      age,
      occupation,
      bankName,
      accountNumber,
      accountName,
      languages,
    } = req.body;

    try {
      if (!userId) {
        res.status(401).json({ message: "Not authorized" });
        return;
      }

      const user = await User.findById(userId);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      if (!user.personalInfo) user.personalInfo = {} as any;
      if (!user.bankDetails) user.bankDetails = {} as any;

      if (phoneNumber !== undefined)
        user.personalInfo.phoneNumber = phoneNumber;
      if (gender !== undefined) user.personalInfo.gender = gender;
      if (nationality !== undefined)
        user.personalInfo.nationality = nationality;
      if (state !== undefined) user.personalInfo.state = state;
      if (age !== undefined) user.personalInfo.age = age;
      if (occupation !== undefined) user.personalInfo.occupation = occupation;

      if (bankName !== undefined) user.bankDetails.bankName = bankName;
      if (accountNumber !== undefined)
        user.bankDetails.accountNumber = accountNumber;
      if (accountName !== undefined) user.bankDetails.accountName = accountName;

      if (languages !== undefined) user.languages = languages;

      user.updatedPersonalInfo = true;

      await user.save();

      res.status(200).json({
        message: "User details updated successfully",
        user: {
          personalInfo: user.personalInfo,
          bankDetails: user.bankDetails,
          languages: user.languages,
        },
      });
    } catch (err) {
      console.error("Error updating user details:", err);
      res.status(500).json({ message: "Failed to update user details" });
    }
  }
);

export const toggleAdminRole = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ message: "User ID is required" });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    const newRole = user.role === "admin" ? "user" : "admin";

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { role: newRole },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: `User role changed to ${newRole} successfully`,
      data: {
        userId: updatedUser?._id,
        fullname: updatedUser?.fullname,
        email: updatedUser?.email,
        role: updatedUser?.role,
      },
    });
  }
);

export const exportAllUsersData = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Get all verified users with selected fields
      const users = await User.find(
        { "emailVerification.isVerified": true },
        {
          fullname: 1,
          email: 1,
          personalInfo: 1,
          languages: 1,
          recordCounts: 1
        }
      ).lean();

      // For each user, get their recordings
      const exportData = await Promise.all(
        users.map(async (user) => {
          // Get regular recordings count
          const regularRecordings = await RegularRecording.find(
            { user: user._id },
            { audioUrl: 1, isVerified: 1, createdAt: 1, prompt: 1 }
          ).populate("prompt", "prompt emotions domain");

          // Get natural recordings count
          const naturalRecordings = await NaturalRecording.find(
            { user: user._id },
            { audioUrl: 1, isVerified: 1, prompt_answer: 1, createdAt: 1, prompt: 1 }
          ).populate("prompt", "prompt");

          return {
            id: user._id,
            fullname: user.fullname,
            email: user.email,
            gender: user.personalInfo?.gender || "Not specified",
            age: user.personalInfo?.age || "Not specified",
            nationality: user.personalInfo?.nationality || "Not specified",
            languages: user.languages || [],
            recordCounts: user.recordCounts || {},
            regularPrompts: regularRecordings.map(rec => ({
              id: rec._id,
              audioUrl: rec.audioUrl,
              isVerified: rec.isVerified,
              createdAt: rec.createdAt,
              promptText: (rec.prompt as any)?.prompt || "Unknown prompt",
              emotions: (rec.prompt as any)?.emotions || [],
              domain: (rec.prompt as any)?.domain || "Unknown"
            })),
            naturalPrompts: naturalRecordings.map(rec => ({
              id: rec._id,
              audioUrl: rec.audioUrl,
              isVerified: rec.isVerified,
              createdAt: rec.createdAt,
              promptText: (rec.prompt as any)?.prompt || "Unknown prompt",
              promptAnswer: rec.prompt_answer || ""
            }))
          };
        })
      );

      res.status(200).json({
        success: true,
        count: exportData.length,
        data: exportData
      });
    } catch (error) {
      console.error("Error exporting user data:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to export user data",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  }
);
