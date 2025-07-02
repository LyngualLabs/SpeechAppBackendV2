import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { User } from "../models/User";
import { NaturalPrompt, INaturalPrompt } from "../models/NaturalPrompts";
import { NaturalRecording } from "../models/NaturalRecordings";
const admin = require("firebase-admin");

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
          Boolean(prompt.text_id && prompt.text && prompt.prompt)
        )
        .map((prompt, index) => ({
          text_id: prompt.text_id,
          text: prompt.text,
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
          text_id: randomPrompt.text_id,
          text: randomPrompt.text,
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
    const { prompt_id } = req.body;

    try {
      if (!prompt_id) {
        res.status(400).json({ error: "Prompt ID is required" });
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

      const uniqueFileName = `${folderName}/${nameSuffix}_${userId}_${
        prompt.text_id
      }_${Date.now()}_${file.originalname}`;

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
            prompt: {
              text_id: prompt.text_id,
              text: prompt.text,
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
