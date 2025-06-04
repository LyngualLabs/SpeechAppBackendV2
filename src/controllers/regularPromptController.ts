import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { User } from "../models/User";
import { RegularPrompt, IRegularPrompt } from "../models/RegularPrompts";

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

// export const getPrompts = asyncHandler(
//   async (req: AuthRequest, res: Response): Promise<void> => {
//     try {
//       // Find the current user
//       const user = await User.findById(req.user?._id);
//       if (!user) {
//         res.status(404).json({ error: "User not found" });
//         return;
//       }

//       // Get the IDs of prompts this user has already recorded
//       const usedPromptIds = (user.prompts || [])
//         .filter((p) => p.prompt_id && p.prompt_id !== "undefined")
//         .map((p) => p.prompt_id);

//       // Create the base query for active prompts with remaining capacity
//       let query: mongoose.FilterQuery<typeof RegularPrompt> = {
//         active: true,
//         $expr: { $lt: ["$userCount", "$maxUsers"] },
//       };

//       // Only add the $nin filter if we have valid prompt IDs to exclude
//       if (usedPromptIds.length > 0) {
//         // Convert valid string IDs to ObjectIds for the query
//         const validObjectIds = usedPromptIds
//           .filter((id) => mongoose.Types.ObjectId.isValid(id))
//           .map((id) => new mongoose.Types.ObjectId(id));

//         // Only add the $nin clause if we have valid ObjectIds
//         if (validObjectIds.length > 0) {
//           query._id = { $nin: validObjectIds };
//         }
//       }

//       // Find prompts that match our criteria
//       const availablePrompts = await RegularPrompt.find(query);

//       if (!availablePrompts.length) {
//         res.status(404).json({ error: "No available prompts" });
//         return;
//       }

//       // Select a random prompt from the available ones
//       const randomPrompt =
//         availablePrompts[Math.floor(Math.random() * availablePrompts.length)];

//       res.json({
//         id: randomPrompt._id,
//         prompt: randomPrompt.prompt,
//         emotion: randomPrompt.emotions,
//         domain: randomPrompt.domain,
//       });
//     } catch (error) {
//       console.error("Error:", error);
//       const errorMessage =
//         error instanceof Error ? error.message : "Server error";
//       res.status(500).json({ error: errorMessage });
//     }
//   }
// );
