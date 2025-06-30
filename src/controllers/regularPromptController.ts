import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { User } from "../models/User";
import { RegularPrompt, IRegularPrompt } from "../models/RegularPrompts";
import { RegularRecording } from "../models/RegularRecordings";
// import { bucket } from "../utils/firebase";
const admin = require("firebase-admin");

const serviceAccount = require("../firebase.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gs://transcribeme-lynguallabs.firebasestorage.app",
});
``;

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
    fullname: string;
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

export const uploadPrompt = asyncHandler(
  async (
    req: AuthRequest & { file?: Express.Multer.File },
    res: Response
  ): Promise<void> => {
    const { prompt_id } = req.body;

    try {
      // 1. Validate required fields
      if (!prompt_id) {
        res.status(400).json({ error: "Prompt ID is required" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Audio file is required" });
        return;
      }

      // 2. Validate prompt_id format
      if (!mongoose.Types.ObjectId.isValid(prompt_id)) {
        res.status(400).json({ error: "Invalid prompt ID format" });
        return;
      }

      // 3. Find the prompt
      const prompt = await RegularPrompt.findById(prompt_id);
      if (!prompt) {
        res.status(404).json({ error: "Prompt not found" });
        return;
      }

      // 4. Check if prompt is active and has capacity
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

      // 5. Check if user already recorded this prompt
      const existingRecording = await RegularRecording.findOne({
        user: req.user?._id,
        prompt: prompt_id,
      });

      if (existingRecording) {
        res
          .status(400)
          .json({ error: "You have already recorded this prompt" });
        return;
      }

      // 6. Upload file to Firebase Storage
      const file = req.file;
      const userFullName =
        req.user?.fullname?.replace(/\s+/g, "_") || "Unknown";
      const userId = req.user?._id;
      const nameSuffix = userFullName.slice(-4);
      const folderName = "Regular_Prompts_V2";

      const uniqueFileName = `${folderName}/${nameSuffix}_${userId}_${
        prompt.text_id
      }_${Date.now()}_${file.originalname}`;

      // const storageRef = bucket.file(uniqueFileName);
      const storageRef = admin.storage().bucket().file(uniqueFileName);

      // Upload the file
      await storageRef.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });

      // Make the file publicly accessible
      await storageRef.makePublic();

      // Generate the public URL
      const publicUrl = `https://storage.googleapis.com/${
        admin.storage().bucket().name
      }/${uniqueFileName}`;

      // 7. Create recording entry
      const newRecording = new RegularRecording({
        user: req.user?._id,
        prompt: prompt_id,
        audioUrl: publicUrl,
        isVerified: false,
      });

      await newRecording.save();

      // 8. Update prompt userCount
      const updatedPrompt = await RegularPrompt.findByIdAndUpdate(
        prompt_id,
        { $inc: { userCount: 1 } },
        { new: true }
      );

      // 9. If prompt reached max users, deactivate it
      if (updatedPrompt && updatedPrompt.userCount >= updatedPrompt.maxUsers) {
        await RegularPrompt.findByIdAndUpdate(prompt_id, { active: false });
      }

      // 10. Return success response
      res.status(201).json({
        success: true,
        message: "Recording uploaded successfully",
        data: {
          recording: {
            id: newRecording._id,
            audioUrl: publicUrl,
            prompt: {
              text_id: prompt.text_id,
              prompt: prompt.prompt,
              emotions: prompt.emotions,
              domain: prompt.domain,
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



// export const verifyPrompts = asyncHandler(
//   async (req: AuthRequest, res: Response): Promise<void> => {
//     const { userId } = req.params;
//     let { recordingIds } = req.body;

//     if (typeof recordingIds === "string") {
//       recordingIds = [recordingIds];
//     }

//     if (!Array.isArray(recordingIds) || recordingIds.length === 0) {
//       res.status(400).json({
//         error: "Please provide recording ID(s) as an array or single string.",
//       });
//       return;
//     }

//     try {
//       // Find the user
//       const user = await User.findById(userId);
//       if (!user) {
//         res.status(404).json({ error: "User not found." });
//         return;
//       }

//       // Find recordings that belong to this user and are not yet verified
//       const recordings = await RegularRecording.find({
//         _id: { $in: recordingIds },
//         user: userId,
//         isVerified: { $ne: true }
//       }).populate('prompt', 'text_id prompt');

//       if (recordings.length === 0) {
//         res.status(400).json({
//           error: "No recordings found or all recordings are already verified.",
//         });
//         return;
//       }

//       // Mark recordings as verified
//       const updateResult = await RegularRecording.updateMany(
//         {
//           _id: { $in: recordings.map(r => r._id) },
//           user: userId,
//           isVerified: { $ne: true }
//         },
//         { isVerified: true }
//       );

//       const verifiedCount = updateResult.modifiedCount;
//       const verifiedRecordings = recordings.map(r =>
//         (r.prompt as any)?.text_id || (r.prompt as any)?.prompt || r._id.toString()
//       );

//       // Increment the verified recordings count
//       user.promptsVerified = (user.promptsVerified || 0) + verifiedCount;

//       // Add a notification
//       const message =
//         verifiedCount === 1
//           ? `Recording "${verifiedRecordings[0]}" has been verified successfully.`
//           : `${verifiedCount} recordings have been verified successfully.`;

//       user.notifications?.push({
//         message,
//         reason: "Verified by admin",
//       });

//       // Save the updated user document
//       await user.save();

//       res.status(200).json({
//         success: true,
//         message,
//         verifiedCount,
//         verifiedRecordings,
//       });
//     } catch (error) {
//       console.error("Error verifying recordings:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }
// );
