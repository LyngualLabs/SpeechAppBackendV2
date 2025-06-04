import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { User } from "../models/User";
import { RegularPrompt, IRegularPrompt } from "../models/RegularPrompts";
import { RegularRecording } from "../models/RegularRecordings";

// Interface for uploaded prompt data
interface IUploadedPrompt {
  text_id: string;
  prompt: string;
  emotions?: string;
  language_tags?: Array<{ language: string; word: string }>;
  domain?: string;
  maxUsers?: number;
}

interface AuthRequest extends Request {
  user?: {
    _id: string;
    prompts?: Array<{ prompt_id: string }>;
  };
}

export const addBulkPrompts = asyncHandler(
  async (
    req: Request & { file?: Express.Multer.File },
    res: Response
  ): Promise<any> => {
    try {
      // 1. Check if file exists
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // 2. Parse JSON file
      let prompts: IUploadedPrompt | IUploadedPrompt[];
      try {
        const fileContent = req.file.buffer.toString("utf8").trim();
        prompts = JSON.parse(fileContent);

        // Convert single object to array
        if (!Array.isArray(prompts)) {
          prompts = [prompts];
        }
      } catch (error: any) {
        return res.status(400).json({
          error: "Invalid JSON file",
          details: error.message,
        });
      }

      // 3. Basic validation
      const validPrompts = prompts
        .filter((prompt): prompt is IUploadedPrompt =>
          Boolean(prompt.text_id && prompt.prompt)
        )
        .map((prompt) => ({
          text_id: prompt.text_id,
          prompt: prompt.prompt,
          emotions: prompt.emotions || "Neutral",
          language_tags: prompt.language_tags || [],
          domain: prompt.domain || "General",
          maxUsers: prompt.maxUsers || 3,
          userCount: 0,
          active: true,
        }));

      if (validPrompts.length === 0) {
        return res.status(400).json({ error: "No valid prompts found" });
      }

      // 4. Insert to database
      const insertedPrompts = await RegularPrompt.insertMany(validPrompts);

      // 5. Return success response
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
      // Find the current user
      const user = await User.findById(req.user?._id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get user's existing recordings to exclude prompts they've already recorded
      const existingRecordings = await RegularRecording.find({ user: user._id })
        .select("prompt")
        .lean();

      const recordedPromptIds = existingRecordings.map((rec) => rec.prompt);

      // Create the base query for active prompts with remaining capacity
      const query: mongoose.FilterQuery<typeof RegularPrompt> = {
        active: true,
        $expr: { $lt: ["$userCount", "$maxUsers"] },
        _id: { $nin: recordedPromptIds },
      };

      // Find prompts that match our criteria
      const availablePrompts = await RegularPrompt.find(query)
        .select("text_id prompt emotions domain language_tags")
        .lean();

      if (!availablePrompts.length) {
        res.status(404).json({
          success: false,
          message: "No available prompts found",
        });
        return;
      }

      // Select a random prompt from the available ones
      const randomPrompt =
        availablePrompts[Math.floor(Math.random() * availablePrompts.length)];

      res.status(200).json({
        success: true,
        data: {
          id: randomPrompt._id,
          text_id: randomPrompt.text_id,
          prompt: randomPrompt.prompt,
          emotions: randomPrompt.emotions,
          domain: randomPrompt.domain,
          language_tags: randomPrompt.language_tags,
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
