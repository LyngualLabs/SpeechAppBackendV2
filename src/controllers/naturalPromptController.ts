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
        prompt_answer: prompt_answer, // Add the prompt answer
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

    // Convert single string to array for uniform processing
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

      // Find recordings that belong to this user
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

      // Get prompt IDs to update their userCount
      const promptIds = recordings
        .map((r) => (r.prompt as any)?._id)
        .filter(Boolean);
      const recordingIdsToDelete = recordings.map((r) => r._id);

      // Delete the recordings
      const deleteResult = await NaturalRecording.deleteMany({
        _id: { $in: recordingIdsToDelete },
        user: userId,
      });

      const deletedCount = deleteResult.deletedCount;

      // Update prompt userCounts (decrease by number of deleted recordings)
      if (promptIds.length > 0) {
        // For each unique prompt, decrease userCount
        const promptCountMap = new Map();
        promptIds.forEach((promptId) => {
          const key = promptId.toString();
          promptCountMap.set(key, (promptCountMap.get(key) || 0) + 1);
        });

        // Update each prompt's userCount
        for (const [promptId, count] of promptCountMap) {
          await NaturalPrompt.findByIdAndUpdate(promptId, {
            $inc: { userCount: -count },
            $set: { active: true }, // Reactivate prompt if it was deactivated
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

      // Get deleted recording details for response
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
