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
          paymentTracking: user.paymentTracking || {
            lastPaymentDate: null,
            totalPaidPrompts: 0,
            totalAmountPaid: 0,
            naturalPromptsPaid: 0,
            regularPromptsPaid: 0,
          },
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
          bankDetails: user.bankDetails,
          paymentTracking: user.paymentTracking || {
            lastPaymentDate: null,
            totalPaidPrompts: 0,
            totalAmountPaid: 0,
            naturalPromptsPaid: 0,
            regularPromptsPaid: 0,
          },
          languages: user.languages,
          recordingStats: {
            totalRecordings:
              user.recordCounts?.totalRegular + user.recordCounts?.totalNatural,
            totalDeleted:
              user.recordCounts?.deletedRegular +
              user.recordCounts?.deletedNatural,
            currentRecordings: regularRecordingsCount + naturalRecordingsCount,
            totalVerified: verifiedRegularCount + verifiedNaturalCount,
          }
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
          recordCounts: 1,
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
            {
              audioUrl: 1,
              isVerified: 1,
              prompt_answer: 1,
              createdAt: 1,
              prompt: 1,
            }
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
            regularPrompts: regularRecordings.map((rec) => ({
              id: rec._id,
              audioUrl: rec.audioUrl,
              isVerified: rec.isVerified,
              createdAt: rec.createdAt,
              promptText: (rec.prompt as any)?.prompt || "Unknown prompt",
              emotions: (rec.prompt as any)?.emotions || [],
              domain: (rec.prompt as any)?.domain || "Unknown",
            })),
            naturalPrompts: naturalRecordings.map((rec) => ({
              id: rec._id,
              audioUrl: rec.audioUrl,
              isVerified: rec.isVerified,
              createdAt: rec.createdAt,
              promptText: (rec.prompt as any)?.prompt || "Unknown prompt",
              promptAnswer: rec.prompt_answer || "",
            })),
          };
        })
      );

      res.status(200).json({
        success: true,
        count: exportData.length,
        data: exportData,
      });
    } catch (error) {
      console.error("Error exporting user data:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export user data",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export const importUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { users } = req.body;

      if (!Array.isArray(users) || users.length === 0) {
        res.status(400).json({
          success: false,
          message: "Please provide an array of users to import",
        });
        return;
      }

      // Validate the user data - requiring just basic fields
      const validUsers = users.filter(
        (user) =>
          user.fullname &&
          user.email &&
          user.password &&
          typeof user.email === "string" &&
          typeof user.fullname === "string"
      );

      if (validUsers.length === 0) {
        res.status(400).json({
          success: false,
          message: "No valid users found to import",
        });
        return;
      }

      // Check for existing emails to avoid duplicates
      const emails = validUsers.map((user) => user.email);
      const existingUsers = await User.find({ email: { $in: emails } });
      const existingEmails = new Set(existingUsers.map((user) => user.email));

      // Filter out users with existing emails
      const newUsers = validUsers.filter(
        (user) => !existingEmails.has(user.email)
      );

      if (newUsers.length === 0) {
        res.status(400).json({
          success: false,
          message: "All users already exist in the system",
          existingCount: existingEmails.size,
        });
        return;
      }

      // Create complete user data structure, preserving existing fields
      const usersToCreate = newUsers.map((user) => ({
        fullname: user.fullname,
        email: user.email,
        password: user.password,
        role: user.role || "user",
        recordCounts: {
          totalRegular: 0,
          totalNatural: 0,
          dailyRegular: 0,
          dailyNatural: 0,
          deletedRegular: 0,
          deletedNatural: 0,
          lastRegularCountDate: null,
          lastNaturalCountDate: null,
        },
        suspended: user.suspended || false,
        updatedPersonalInfo: user.updatedPersonalInfo || false,
        signedWaiver: user.signedWaiver || false,
        personalInfo: user.personalInfo || {
          age: null,
          gender: null,
          nationality: null,
          state: null,
          phoneNumber: null,
          occupation: null,
        },
        bankDetails: user.bankDetails || {
          bankName: null,
          accountName: null,
          accountNumber: null,
        },
        languages: user.languages || [],
        emailVerification: {
          isVerified: user.emailVerificationStatus || false,
          code: null,
          expiresAt: null,
        },
      }));

      // Insert the new users
      const insertedUsers = await User.insertMany(usersToCreate);

      res.status(201).json({
        success: true,
        message: `Successfully imported ${insertedUsers.length} users`,
        skippedCount: existingEmails.size,
        insertedCount: insertedUsers.length,
        data: insertedUsers.map((user) => ({
          id: user._id,
          fullname: user.fullname,
          email: user.email,
          personalInfo: user.personalInfo,
          hasCompletedProfile: user.updatedPersonalInfo,
          signedWaiver: user.signedWaiver,
          languages: user.languages,
        })),
      });
    } catch (error) {
      console.error("Error importing users:", error);
      res.status(500).json({
        success: false,
        message: "Failed to import users",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Update user's payment tracking (admin only)
export const updateUserPayment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { amount, promptCount } = req.body;

      if (!userId) {
        res.status(400).json({ message: "User ID is required" });
        return;
      }

      if (!amount || !promptCount) {
        res.status(400).json({
          message: "Amount and prompt count are required",
        });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      // Initialize payment tracking if it doesn't exist
      if (!user.paymentTracking) {
        user.paymentTracking = {
          lastPaymentDate: null,
          totalPaidPrompts: 0,
          totalAmountPaid: 0,
          naturalPromptsPaid: 0,
          regularPromptsPaid: 0,
        };
      }

      // Update payment tracking
      user.paymentTracking.lastPaymentDate = new Date();
      user.paymentTracking.totalPaidPrompts += promptCount;
      user.paymentTracking.totalAmountPaid += amount;

      await user.save();

      res.status(200).json({
        success: true,
        message: "User payment updated successfully",
        data: {
          userId: user._id,
          fullname: user.fullname,
          paymentTracking: user.paymentTracking,
        },
      });
    } catch (error) {
      console.error("Error updating user payment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update user payment",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get payment statistics for all users (admin only)
export const getPaymentStats = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$paymentTracking.totalAmountPaid" },
            totalPaidPrompts: { $sum: "$paymentTracking.totalPaidPrompts" },
            totalNaturalPromptsPaid: {
              $sum: "$paymentTracking.naturalPromptsPaid",
            },
            totalRegularPromptsPaid: {
              $sum: "$paymentTracking.regularPromptsPaid",
            },
            totalPayingUsers: {
              $sum: {
                $cond: [{ $gt: ["$paymentTracking.totalAmountPaid", 0] }, 1, 0],
              },
            },
          },
        },
      ]);

      const result = stats[0] || {
        totalRevenue: 0,
        totalPaidPrompts: 0,
        totalNaturalPromptsPaid: 0,
        totalRegularPromptsPaid: 0,
        totalPayingUsers: 0,
      };

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error getting payment stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get payment statistics",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get payment details of a particular user (admin only)
export const getUserPaymentDetails = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ message: "User ID is required" });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
        return;
      }

      const user = await User.findById(userId).select(
        "fullname email paymentTracking"
      );

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          fullname: user.fullname,
          email: user.email,
          paymentTracking: user.paymentTracking || {
            lastPaymentDate: null,
            totalPaidPrompts: 0,
            totalAmountPaid: 0,
            naturalPromptsPaid: 0,
            regularPromptsPaid: 0,
          },
        },
      });
    } catch (error) {
      console.error("Error getting user payment details:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get user payment details",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
