import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { User } from "../models/User";
import { NaturalPrompt, INaturalPrompt } from "../models/NaturalPrompts";
import { NaturalRecording } from "../models/NaturalRecordings";
const admin = require("firebase-admin");
import { firebaseConfig } from "../config/firebase";

// Initialize Firebase Admin
const serviceAccount = firebaseConfig;
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "gs://transcribeme-lynguallabs.firebasestorage.app",
  });
}

// Interface for uploaded prompt data

interface IUploadedNaturalPrompt {
  text_id: string;
  text: string;
  prompt: string;
  maxUsers?: number;
}

interface AuthRequest extends Request {
  user?: {
    _id: string;
    fullname: string;
  };
}

export const addBulkPrompts = asyncHandler(
  async (
    req: Request & { file?: Express.Multer.File },
    res: Response
  ): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let prompts: IUploadedNaturalPrompt | IUploadedNaturalPrompt[];
      try {
        const fileContent = req.file.buffer.toString("utf8").trim();
        prompts = JSON.parse(fileContent);

        if (!Array.isArray(prompts)) {
          prompts = [prompts];
        }
      } catch (error: any) {
        return res.status(400).json({
          error: "Invalid JSON file",
          details: error.message,
        });
      }

      const validPrompts = prompts
        .filter((prompt): prompt is IUploadedNaturalPrompt =>
          Boolean(prompt.prompt)
        )
        .map((prompt, index) => ({
          prompt: prompt.prompt,
          prompt_id: `${index + 1}-${prompts.length}`,
          maxUsers: prompt.maxUsers || 3,
          userCount: 0,
          active: true,
        }));

      if (validPrompts.length === 0) {
        return res.status(400).json({ error: "No valid prompts found" });
      }

      const insertedPrompts = await NaturalPrompt.insertMany(validPrompts);

      res.status(201).json({
        success: true,
        insertedCount: insertedPrompts.length,
        prompts: insertedPrompts,
      });
    } catch (error) {
      console.error("Bulk upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export const getPrompts = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.user?._id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const existingRecordings = await NaturalRecording.find({ user: user._id })
        .select("prompt")
        .lean();

      const recordedPromptIds = existingRecordings.map((rec) => rec.prompt);

      const query: mongoose.FilterQuery<typeof NaturalPrompt> = {
        active: true,
        $expr: { $lt: ["$userCount", "$maxUsers"] },
        _id: { $nin: recordedPromptIds },
      };

      const availablePrompts = await NaturalPrompt.find(query)
        .select("text_id text prompt")
        .lean();

      if (!availablePrompts.length) {
        res.status(404).json({
          success: false,
          message: "No available prompts found",
        });
        return;
      }

      const randomPrompt =
        availablePrompts[Math.floor(Math.random() * availablePrompts.length)];

      res.status(200).json({
        success: true,
        data: {
          id: randomPrompt._id,
          prompt: randomPrompt.prompt,
        },
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export const checkDailyNaturalCount = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Access lastNaturalCountDate from the recordCounts object
      const lastResetDate = user.recordCounts?.lastNaturalCountDate
        ? new Date(user.recordCounts.lastNaturalCountDate)
        : null;

      if (!lastResetDate || lastResetDate.getTime() < today.getTime()) {
        // Reset the daily count using the nested structure
        await User.findByIdAndUpdate(userId, {
          $set: {
            "recordCounts.dailyNatural": 0,
            "recordCounts.lastNaturalCountDate": today
          }
        });

        res.status(200).json({
          success: true,
          message: "Daily natural count reset",
          data: { 
            dailyNaturalCount: 0, 
            lastReset: today,
          },
        });
      } else {
        res.status(200).json({
          success: true,
          message: "Daily natural count retrieved",
          data: {
            dailyNaturalCount: user.recordCounts?.dailyNatural || 0,
            lastReset: user.recordCounts?.lastNaturalCountDate,
          },
        });
      }
    } catch (error) {
      console.error("Error checking daily natural count:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export const uploadPrompt = asyncHandler(
  async (
    req: AuthRequest & { file?: Express.Multer.File },
    res: Response
  ): Promise<void> => {
    const { prompt_id, prompt_answer } = req.body;

    try {
      if (!prompt_id) {
        res.status(400).json({ error: "Prompt ID is required" });
        return;
      }

      if (!prompt_answer) {
        res.status(400).json({ error: "Prompt answer is required" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Audio file is required" });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(prompt_id)) {
        res.status(400).json({ error: "Invalid prompt ID format" });
        return;
      }

      const prompt = await NaturalPrompt.findById(prompt_id);
      if (!prompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }

      if (!prompt.active) {
        res.status(400).json({ error: "This prompt is no longer active" });
        return;
      }

      if (prompt.userCount >= prompt.maxUsers) {
        res
          .status(400)
          .json({ error: "This prompt has reached maximum users" });
        return;
      }

      const existingRecording = await NaturalRecording.findOne({
        user: req.user?._id,
        prompt: prompt_id,
      });

      if (existingRecording) {
        res
          .status(400)
          .json({ error: "You have already recorded this prompt" });
        return;
      }

      const file = req.file;
      const userFullName =
        req.user?.fullname?.replace(/\s+/g, "_") || "Unknown";
      const userId = req.user?._id;
      const nameSuffix = userFullName.slice(-4);
      const folderName = "Natural_Prompts_V2";

      const uniqueFileName = `${folderName}/${nameSuffix}_${userId}_${Date.now()}_${
        file.originalname
      }`;

      const storageRef = admin.storage().bucket().file(uniqueFileName);

      await storageRef.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });

      await storageRef.makePublic();

      const publicUrl = `https://storage.googleapis.com/${
        admin.storage().bucket().name
      }/${uniqueFileName}`;

      const newRecording = new NaturalRecording({
        user: req.user?._id,
        prompt: prompt_id,
        audioUrl: publicUrl,
        prompt_answer: prompt_answer,
        isVerified: false,
      });

      await newRecording.save();

      const updatedPrompt = await NaturalPrompt.findByIdAndUpdate(
        prompt_id,
        { $inc: { userCount: 1 } },
        { new: true }
      );

      if (updatedPrompt && updatedPrompt.userCount >= updatedPrompt.maxUsers) {
        await NaturalPrompt.findByIdAndUpdate(prompt_id, { active: false });
      }

      await User.findByIdAndUpdate(req.user?._id, {
        $inc: {
          "recordCounts.dailyNatural": 1,
          "recordCounts.totalNatural": 1,
        },
        $set: { "recordCounts.lastNaturalCountDate": new Date() },
      });

      res.status(201).json({
        success: true,
        message: "Recording uploaded successfully",
        data: {
          recording: {
            id: newRecording._id,
            audioUrl: publicUrl,
            prompt_answer: newRecording.prompt_answer, // Include in response
            prompt: {
              prompt: prompt.prompt,
            },
            createdAt: newRecording.createdAt,
          },
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export const getUserPrompts = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = await User.findById(req.user?._id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const userRecordings = await NaturalRecording.find({ user: user._id })
        .populate({
          path: "prompt",
          select: "text_id text prompt",
        })
        .sort({ createdAt: -1 })
        .lean();

      if (!userRecordings.length) {
        res.status(200).json({
          success: true,
          message: "No recordings found for this user",
          data: {
            recordings: [],
            totalCount: 0,
          },
        });
        return;
      }

      const formattedRecordings = userRecordings.map((recording) => ({
        id: recording._id,
        audioUrl: recording.audioUrl,
        isVerified: recording.isVerified,
        createdAt: recording.createdAt,
        updatedAt: recording.updatedAt,
        prompt: {
          id: (recording.prompt as any)?._id,
          text_id: (recording.prompt as any)?.text_id,
          text: (recording.prompt as any)?.text,
          prompt: (recording.prompt as any)?.prompt,
        },
      }));

      res.status(200).json({
        success: true,
        data: {
          recordings: formattedRecordings,
          totalCount: formattedRecordings.length,
          verifiedCount: formattedRecordings.filter((r) => r.isVerified).length,
          unverifiedCount: formattedRecordings.filter((r) => !r.isVerified)
            .length,
        },
      });
    } catch (error) {
      console.error("Error fetching user prompts:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export const getPromptsByUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
      // Validate userId format
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ error: "Invalid user ID format" });
        return;
      }

      // Find the user
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get user's recordings with prompt details
      const userRecordings = await NaturalRecording.find({ user: userId })
        .populate({
          path: "prompt",
          select: "prompt",
        })
        .sort({ createdAt: -1 })
        .lean();

      if (!userRecordings.length) {
        res.status(200).json({
          success: true,
          message: `No recordings found for user ${user.fullname}`,
          data: {
            user: {
              id: user._id,
              fullname: user.fullname,
              email: user.email,
            },
            recordings: [],
            totalCount: 0,
          },
        });
        return;
      }

      // Format the response
      const formattedRecordings = userRecordings.map((recording) => ({
        id: recording._id,
        audioUrl: recording.audioUrl,
        isVerified: recording.isVerified,
        prompt_answer: recording.prompt_answer,
        prompt: {
          id: (recording.prompt as any)?._id,
          prompt_id: (recording.prompt as any)?.prompt_id,
          prompt: (recording.prompt as any)?.prompt,
        },
      }));

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user._id,
            fullname: user.fullname,
            email: user.email,
          },
          recordings: formattedRecordings,
          totalCount: formattedRecordings.length,
          verifiedCount: formattedRecordings.filter((r) => r.isVerified).length,
          unverifiedCount: formattedRecordings.filter((r) => !r.isVerified)
            .length,
        },
      });
    } catch (error) {
      console.error("Error fetching user prompts:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export const verifyPrompts = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    let { recordingIds } = req.body;

    if (typeof recordingIds === "string") {
      recordingIds = [recordingIds];
    }

    if (!Array.isArray(recordingIds) || recordingIds.length === 0) {
      res.status(400).json({
        error: "Please provide recording ID(s) as an array or single string.",
      });
      return;
    }

    try {
      // Find the user
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      // Find recordings that belong to this user and are not yet verified
      const recordings = await NaturalRecording.find({
        _id: { $in: recordingIds },
        user: userId,
        isVerified: { $ne: true },
      }).populate("prompt", "prompt");

      if (recordings.length === 0) {
        res.status(400).json({
          error: "No recordings found or all recordings are already verified.",
        });
        return;
      }

      // Mark recordings as verified
      const updateResult = await NaturalRecording.updateMany(
        {
          _id: { $in: recordings.map((r) => r._id) },
          user: userId,
          isVerified: { $ne: true },
        },
        { isVerified: true }
      );

      const verifiedCount = updateResult.modifiedCount;

      res.status(200).json({
        success: true,
        verifiedCount,
      });
    } catch (error) {
      console.error("Error verifying recordings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export const deletePrompts = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    let { recordingIds } = req.body;

    if (typeof recordingIds === "string") {
      recordingIds = [recordingIds];
    }

    if (!Array.isArray(recordingIds) || recordingIds.length === 0) {
      res.status(400).json({
        error: "Please provide recording ID(s) as an array or single string.",
      });
      return;
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const recordings = await NaturalRecording.find({
        _id: { $in: recordingIds },
        user: userId,
      }).populate("prompt", "prompt _id");

      if (recordings.length === 0) {
        res.status(404).json({
          error: "No recordings found for the provided IDs.",
        });
        return;
      }

      const promptIds = recordings
        .map((r) => (r.prompt as any)?._id)
        .filter(Boolean);
      const recordingIdsToDelete = recordings.map((r) => r._id);

      const deleteResult = await NaturalRecording.deleteMany({
        _id: { $in: recordingIdsToDelete },
        user: userId,
      });

      const deletedCount = deleteResult.deletedCount;

      await User.findByIdAndUpdate(userId, {
        $inc: { "recordCounts.deletedNatural": deletedCount },
      });

      if (promptIds.length > 0) {
        const promptCountMap = new Map();
        promptIds.forEach((promptId) => {
          const key = promptId.toString();
          promptCountMap.set(key, (promptCountMap.get(key) || 0) + 1);
        });

        for (const [promptId, count] of promptCountMap) {
          await NaturalPrompt.findByIdAndUpdate(promptId, {
            $inc: { userCount: -count },
            $set: { active: true },
          });
        }
      }

      // Delete audio files from Firebase Storage
      for (const recording of recordings) {
        try {
          const fileName = recording.audioUrl.split("/").pop();
          if (fileName) {
            const storageRef = admin
              .storage()
              .bucket()
              .file(`Natural_Prompts_V2/${fileName}`);
            await storageRef.delete();
          }
        } catch (fileError) {
          console.warn(
            `Failed to delete audio file: ${recording.audioUrl}`,
            fileError
          );
        }
      }

      const deletedRecordings = recordings.map((r) => ({
        id: r._id,
        promptText: (r.prompt as any)?.prompt || "Unknown",
      }));

      res.status(200).json({
        success: true,
        data: {
          deletedCount,
          deletedRecordings: deletedRecordings.map((r) => ({
            recordingId: r.id,
            promptText: r.promptText,
          })),
          totalRequested: recordingIds.length,
          notFound: recordingIds.length - recordings.length,
        },
      });
    } catch (error) {
      console.error("Error deleting recordings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export const getEnhancedNaturalPromptStats = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Basic counts
      const totalPrompts = await NaturalPrompt.countDocuments();
      const activePrompts = await NaturalPrompt.countDocuments({
        active: true,
      });

      // Available prompts (active with remaining capacity)
      const availablePrompts = await NaturalPrompt.countDocuments({
        active: true,
        $expr: { $lt: ["$userCount", "$maxUsers"] },
      });

      // Usage statistics
      const fullyUsedPrompts = await NaturalPrompt.countDocuments({
        $expr: { $gte: ["$userCount", "$maxUsers"] },
      });

      const unusedPrompts = await NaturalPrompt.countDocuments({
        userCount: 0,
      });

      // Usage distribution
      const usageDistribution = await NaturalPrompt.aggregate([
        {
          $group: {
            _id: "$userCount",
            count: { $sum: 1 },
            prompts: { $push: { id: "$_id", prompt_id: "$prompt_id" } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Get recording statistics
      const totalRecordings = await NaturalRecording.countDocuments();
      const verifiedRecordings = await NaturalRecording.countDocuments({
        isVerified: true,
      });
      const unverifiedRecordings = totalRecordings - verifiedRecordings;

      // Calculate percentages
      const activePercentage =
        totalPrompts > 0 ? (activePrompts / totalPrompts) * 100 : 0;
      const availablePercentage =
        totalPrompts > 0 ? (availablePrompts / totalPrompts) * 100 : 0;
      const usagePercentage =
        totalPrompts > 0 ? (fullyUsedPrompts / totalPrompts) * 100 : 0;
      const verificationPercentage =
        totalRecordings > 0 ? (verifiedRecordings / totalRecordings) * 100 : 0;

      // Get top users by recording count
      const topUsers = await NaturalRecording.aggregate([
        {
          $group: {
            _id: "$user",
            totalRecordings: { $sum: 1 },
            verifiedRecordings: {
              $sum: { $cond: [{ $eq: ["$isVerified", true] }, 1, 0] },
            },
          },
        },
        {
          $sort: { totalRecordings: -1 },
        },
        {
          $limit: 10,
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo",
          },
        },
        {
          $project: {
            _id: 1,
            totalRecordings: 1,
            verifiedRecordings: 1,
            verificationRate: {
              $multiply: [
                {
                  $divide: [
                    "$verifiedRecordings",
                    { $max: ["$totalRecordings", 1] },
                  ],
                },
                100,
              ],
            },
            username: { $arrayElemAt: ["$userInfo.fullname", 0] },
          },
        },
      ]);

      // Weekly recording trends (last 4 weeks)
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const weeklyTrends = await NaturalRecording.aggregate([
        {
          $match: {
            createdAt: { $gte: fourWeeksAgo },
          },
        },
        {
          $group: {
            _id: {
              week: { $week: "$createdAt" },
              year: { $year: "$createdAt" },
            },
            count: { $sum: 1 },
            verified: {
              $sum: { $cond: [{ $eq: ["$isVerified", true] }, 1, 0] },
            },
          },
        },
        {
          $sort: { "_id.year": 1, "_id.week": 1 },
        },
      ]);

      // System status with multiple thresholds
      let status = "healthy";
      let statusMessage = "System operating normally";
      const suggestions: string[] = [];

      if (availablePercentage < 10) {
        status = "critical";
        statusMessage =
          "CRITICAL: Available natural prompt pool nearly depleted";
        suggestions.push(
          "Add new natural prompts immediately",
          "Review inactive prompts for potential reactivation"
        );
      } else if (availablePercentage < 30) {
        status = "warning";
        statusMessage = "WARNING: Available natural prompt pool getting low";
        suggestions.push("Consider adding more natural prompts");
      }

      if (usagePercentage >= 80) {
        status = status === "healthy" ? "warning" : status;
        statusMessage += " | High natural prompt usage detected";
        suggestions.push(
          "Consider increasing maxUsers for some natural prompts"
        );
      }

      if (verificationPercentage < 40 && totalRecordings > 100) {
        status = status === "critical" ? "critical" : "warning";
        statusMessage += " | Low natural recording verification rate";
        suggestions.push("Increase natural recording verification throughput");
      }

      res.status(200).json({
        success: true,
        promptCounts: {
          total: totalPrompts,
          active: activePrompts,
          available: availablePrompts,
          fullyUsed: fullyUsedPrompts,
          inactive: totalPrompts - activePrompts,
          unused: unusedPrompts,
        },
        recordingCounts: {
          total: totalRecordings,
          verified: verifiedRecordings,
          unverified: unverifiedRecordings,
        },
        percentages: {
          activePrompts: parseFloat(activePercentage.toFixed(2)),
          availablePrompts: parseFloat(availablePercentage.toFixed(2)),
        },
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error("Error getting enhanced natural prompt statistics:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export const getMyVerifiedPrompts = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get total count of verified recordings for this user
      const totalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: true,
      });

      // Get user's verified recordings with pagination
      const userRecordings = await NaturalRecording.find({
        user: userId,
        isVerified: true,
      })
        .populate({
          path: "prompt",
          select: "prompt prompt_id",
        })
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit)
        .lean();

      if (!userRecordings.length) {
        res.status(200).json({
          success: true,
          message: "No verified recordings found",
          data: {
            recordings: [],
            totalCount: 0,
            pagination: {
              total: 0,
              page,
              limit,
              pages: 0,
            },
          },
        });
        return;
      }

      const formattedRecordings = userRecordings.map((recording) => ({
        id: recording._id,
        audioUrl: recording.audioUrl,
        isVerified: recording.isVerified,
        prompt_answer: recording.prompt_answer,
        createdAt: recording.createdAt,
        prompt: {
          id: (recording.prompt as any)?._id,
          prompt_id: (recording.prompt as any)?.prompt_id,
          prompt: (recording.prompt as any)?.prompt,
        },
      }));

      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        success: true,
        data: {
          recordings: formattedRecordings,
          totalCount,
          pagination: {
            total: totalCount,
            page,
            limit,
            pages: totalPages,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching verified user prompts:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export const getMyUnverifiedPrompts = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get total count of unverified recordings for this user
      const totalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: false,
      });

      // Get user's unverified recordings with pagination
      const userRecordings = await NaturalRecording.find({
        user: userId,
        isVerified: false,
      })
        .populate({
          path: "prompt",
          select: "prompt prompt_id",
        })
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit)
        .lean();

      if (!userRecordings.length) {
        res.status(200).json({
          success: true,
          message: "No unverified recordings found",
          data: {
            recordings: [],
            totalCount: 0,
            pagination: {
              total: 0,
              page,
              limit,
              pages: 0,
            },
          },
        });
        return;
      }

      const formattedRecordings = userRecordings.map((recording) => ({
        id: recording._id,
        audioUrl: recording.audioUrl,
        isVerified: recording.isVerified,
        prompt_answer: recording.prompt_answer,
        createdAt: recording.createdAt,
        prompt: {
          id: (recording.prompt as any)?._id,
          prompt_id: (recording.prompt as any)?.prompt_id,
          prompt: (recording.prompt as any)?.prompt,
        },
      }));

      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        success: true,
        data: {
          recordings: formattedRecordings,
          totalCount,
          pagination: {
            total: totalCount,
            page,
            limit,
            pages: totalPages,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching unverified user prompts:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export const getVerifiedPromptsByUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ error: "Invalid user ID format" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get total count of verified recordings for this user
      const totalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: true,
      });

      // Get user's verified recordings with pagination
      const userRecordings = await NaturalRecording.find({
        user: userId,
        isVerified: true,
      })
        .populate({
          path: "prompt",
          select: "prompt prompt_id",
        })
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit)
        .lean();

      if (!userRecordings.length) {
        res.status(200).json({
          success: true,
          message: `No verified recordings found for user ${user.fullname}`,
          data: {
            user: {
              id: user._id,
              fullname: user.fullname,
              email: user.email,
            },
            recordings: [],
            totalCount: 0,
            pagination: {
              total: 0,
              page,
              limit,
              pages: 0,
            },
          },
        });
        return;
      }

      const formattedRecordings = userRecordings.map((recording) => ({
        id: recording._id,
        audioUrl: recording.audioUrl,
        isVerified: recording.isVerified,
        prompt_answer: recording.prompt_answer,
        createdAt: recording.createdAt,
        prompt: {
          id: (recording.prompt as any)?._id,
          prompt_id: (recording.prompt as any)?.prompt_id,
          prompt: (recording.prompt as any)?.prompt,
        },
      }));

      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user._id,
            fullname: user.fullname,
            email: user.email,
          },
          recordings: formattedRecordings,
          totalCount,
          pagination: {
            total: totalCount,
            page,
            limit,
            pages: totalPages,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching verified user prompts:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export const getUnverifiedPromptsByUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ error: "Invalid user ID format" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get total count of unverified recordings for this user
      const totalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: false,
      });

      // Get user's unverified recordings with pagination
      const userRecordings = await NaturalRecording.find({
        user: userId,
        isVerified: false,
      })
        .populate({
          path: "prompt",
          select: "prompt prompt_id",
        })
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit)
        .lean();

      if (!userRecordings.length) {
        res.status(200).json({
          success: true,
          message: `No unverified recordings found for user ${user.fullname}`,
          data: {
            user: {
              id: user._id,
              fullname: user.fullname,
              email: user.email,
            },
            recordings: [],
            totalCount: 0,
            pagination: {
              total: 0,
              page,
              limit,
              pages: 0,
            },
          },
        });
        return;
      }

      const formattedRecordings = userRecordings.map((recording) => ({
        id: recording._id,
        audioUrl: recording.audioUrl,
        isVerified: recording.isVerified,
        prompt_answer: recording.prompt_answer,
        createdAt: recording.createdAt,
        prompt: {
          id: (recording.prompt as any)?._id,
          prompt_id: (recording.prompt as any)?.prompt_id,
          prompt: (recording.prompt as any)?.prompt,
        },
      }));

      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user._id,
            fullname: user.fullname,
            email: user.email,
          },
          recordings: formattedRecordings,
          totalCount,
          pagination: {
            total: totalCount,
            page,
            limit,
            pages: totalPages,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching unverified user prompts:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);
