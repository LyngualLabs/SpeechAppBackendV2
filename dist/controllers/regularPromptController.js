"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePrompts = exports.verifyPrompts = exports.getPromptById = exports.getUserPrompts = exports.uploadPrompt = exports.getPrompts = exports.addBulkPrompts = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const RegularPrompts_1 = require("../models/RegularPrompts");
const RegularRecordings_1 = require("../models/RegularRecordings");
const admin = require("firebase-admin");
const firebase_1 = require("../config/firebase");
const serviceAccount = firebase_1.firebaseConfig;
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "gs://transcribeme-lynguallabs.firebasestorage.app",
});
exports.addBulkPrompts = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Check if file exists
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        // 2. Parse JSON file
        let prompts;
        try {
            const fileContent = req.file.buffer.toString("utf8").trim();
            prompts = JSON.parse(fileContent);
            // Convert single object to array
            if (!Array.isArray(prompts)) {
                prompts = [prompts];
            }
        }
        catch (error) {
            return res.status(400).json({
                error: "Invalid JSON file",
                details: error.message,
            });
        }
        // 3. Basic validation
        const validPrompts = prompts
            .filter((prompt) => Boolean(prompt.text_id && prompt.prompt))
            .map((prompt, index) => ({
            text_id: prompt.text_id,
            prompt: prompt.prompt,
            prompt_id: `${index + 1}-${prompts.length}`,
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
        const insertedPrompts = yield RegularPrompts_1.RegularPrompt.insertMany(validPrompts);
        // 5. Return success response
        res.status(201).json({
            success: true,
            insertedCount: insertedPrompts.length,
            prompts: insertedPrompts,
        });
    }
    catch (error) {
        console.error("Bulk upload error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
exports.getPrompts = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Find the current user
        const user = yield User_1.User.findById((_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        // Get user's existing recordings to exclude prompts they've already recorded
        const existingRecordings = yield RegularRecordings_1.RegularRecording.find({ user: user._id })
            .select("prompt")
            .lean();
        const recordedPromptIds = existingRecordings.map((rec) => rec.prompt);
        // Create the base query for active prompts with remaining capacity
        const query = {
            active: true,
            $expr: { $lt: ["$userCount", "$maxUsers"] },
            _id: { $nin: recordedPromptIds },
        };
        // Find prompts that match our criteria
        const availablePrompts = yield RegularPrompts_1.RegularPrompt.find(query)
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
        const randomPrompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
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
    }
    catch (error) {
        console.error("Error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Server error",
        });
    }
}));
exports.uploadPrompt = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
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
        if (!mongoose_1.default.Types.ObjectId.isValid(prompt_id)) {
            res.status(400).json({ error: "Invalid prompt ID format" });
            return;
        }
        // 3. Find the prompt
        const prompt = yield RegularPrompts_1.RegularPrompt.findById(prompt_id);
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
        const existingRecording = yield RegularRecordings_1.RegularRecording.findOne({
            user: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
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
        const userFullName = ((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.fullname) === null || _c === void 0 ? void 0 : _c.replace(/\s+/g, "_")) || "Unknown";
        const userId = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id;
        const nameSuffix = userFullName.slice(-4);
        const folderName = "Regular_Prompts_V2";
        const uniqueFileName = `${folderName}/${nameSuffix}_${userId}_${prompt.text_id}_${Date.now()}_${file.originalname}`;
        // const storageRef = bucket.file(uniqueFileName);
        const storageRef = admin.storage().bucket().file(uniqueFileName);
        // Upload the file
        yield storageRef.save(file.buffer, {
            metadata: {
                contentType: file.mimetype,
            },
        });
        // Make the file publicly accessible
        yield storageRef.makePublic();
        // Generate the public URL
        const publicUrl = `https://storage.googleapis.com/${admin.storage().bucket().name}/${uniqueFileName}`;
        // 7. Create recording entry
        const newRecording = new RegularRecordings_1.RegularRecording({
            user: (_e = req.user) === null || _e === void 0 ? void 0 : _e._id,
            prompt: prompt_id,
            audioUrl: publicUrl,
            isVerified: false,
        });
        yield newRecording.save();
        // 8. Update prompt userCount
        const updatedPrompt = yield RegularPrompts_1.RegularPrompt.findByIdAndUpdate(prompt_id, { $inc: { userCount: 1 } }, { new: true });
        // 9. If prompt reached max users, deactivate it
        if (updatedPrompt && updatedPrompt.userCount >= updatedPrompt.maxUsers) {
            yield RegularPrompts_1.RegularPrompt.findByIdAndUpdate(prompt_id, { active: false });
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
    }
    catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
            error: "Internal server error",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
}));
exports.getUserPrompts = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Find the current user
        const user = yield User_1.User.findById((_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        // Get user's recordings with prompt details
        const userRecordings = yield RegularRecordings_1.RegularRecording.find({ user: user._id })
            .populate({
            path: "prompt",
            select: "text_id prompt emotions domain language_tags",
        })
            .sort({ createdAt: -1 }) // Most recent first
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
        // Format the response
        const formattedRecordings = userRecordings.map((recording) => {
            var _a, _b, _c, _d, _e;
            return ({
                id: recording._id,
                audioUrl: recording.audioUrl,
                isVerified: recording.isVerified,
                createdAt: recording.createdAt,
                updatedAt: recording.updatedAt,
                prompt: {
                    id: (_a = recording.prompt) === null || _a === void 0 ? void 0 : _a._id,
                    text_id: (_b = recording.prompt) === null || _b === void 0 ? void 0 : _b.text_id,
                    prompt: (_c = recording.prompt) === null || _c === void 0 ? void 0 : _c.prompt,
                    emotions: (_d = recording.prompt) === null || _d === void 0 ? void 0 : _d.emotions,
                    domain: (_e = recording.prompt) === null || _e === void 0 ? void 0 : _e.domain,
                },
            });
        });
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
    }
    catch (error) {
        console.error("Error fetching user prompts:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Server error",
        });
    }
}));
exports.getPromptById = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        // Validate if ID is provided
        if (!id) {
            res.status(400).json({ error: "Prompt ID is required" });
            return;
        }
        let prompt;
        // Check if it's a valid MongoDB ObjectId format
        if (mongoose_1.default.Types.ObjectId.isValid(id)) {
            // Search by MongoDB _id
            prompt = yield RegularPrompts_1.RegularPrompt.findById(id).lean();
        }
        // If not found by _id or not a valid ObjectId, try searching by prompt_id
        if (!prompt) {
            prompt = yield RegularPrompts_1.RegularPrompt.findOne({ prompt_id: id }).lean();
        }
        // If still not found, return error
        if (!prompt) {
            res.status(404).json({
                success: false,
                error: "Prompt not found",
            });
            return;
        }
        // Format response
        res.status(200).json({
            success: true,
            data: {
                id: prompt._id,
                text_id: prompt.text_id,
                prompt: prompt.prompt,
                prompt_id: prompt.prompt_id,
                emotions: prompt.emotions,
                domain: prompt.domain,
                language_tags: prompt.language_tags,
                maxUsers: prompt.maxUsers,
                userCount: prompt.userCount,
                active: prompt.active,
                createdAt: prompt.createdAt,
                updatedAt: prompt.updatedAt,
            },
        });
    }
    catch (error) {
        console.error("Error fetching prompt:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Server error",
        });
    }
}));
exports.verifyPrompts = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const user = yield User_1.User.findById(userId);
        if (!user) {
            res.status(404).json({ error: "User not found." });
            return;
        }
        // Find recordings that belong to this user and are not yet verified
        const recordings = yield RegularRecordings_1.RegularRecording.find({
            _id: { $in: recordingIds },
            user: userId,
            isVerified: { $ne: true },
        }).populate("prompt", "text_id prompt");
        if (recordings.length === 0) {
            res.status(400).json({
                error: "No recordings found or all recordings are already verified.",
            });
            return;
        }
        // Mark recordings as verified
        const updateResult = yield RegularRecordings_1.RegularRecording.updateMany({
            _id: { $in: recordings.map((r) => r._id) },
            user: userId,
            isVerified: { $ne: true },
        }, { isVerified: true });
        const verifiedCount = updateResult.modifiedCount;
        // Save the updated user document
        yield user.save();
        res.status(200).json({
            success: true,
            verifiedCount,
        });
    }
    catch (error) {
        console.error("Error verifying recordings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
exports.deletePrompts = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const user = yield User_1.User.findById(userId);
        if (!user) {
            res.status(404).json({ error: "User not found." });
            return;
        }
        // Find recordings that belong to this user
        const recordings = yield RegularRecordings_1.RegularRecording.find({
            _id: { $in: recordingIds },
            user: userId,
        }).populate("prompt", "text_id prompt _id");
        if (recordings.length === 0) {
            res.status(404).json({
                error: "No recordings found for the provided IDs.",
            });
            return;
        }
        // Get prompt IDs to update their userCount
        const promptIds = recordings
            .map((r) => { var _a; return (_a = r.prompt) === null || _a === void 0 ? void 0 : _a._id; })
            .filter(Boolean);
        const recordingIdsToDelete = recordings.map((r) => r._id);
        // Delete the recordings
        const deleteResult = yield RegularRecordings_1.RegularRecording.deleteMany({
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
                yield RegularPrompts_1.RegularPrompt.findByIdAndUpdate(promptId, {
                    $inc: { userCount: -count },
                    $set: { active: true }, // Reactivate prompt if it was deactivated
                });
            }
        }
        for (const recording of recordings) {
            try {
                const fileName = recording.audioUrl.split("/").pop();
                if (fileName) {
                    const storageRef = admin
                        .storage()
                        .bucket()
                        .file(`Regular_Prompts_V2/${fileName}`);
                    yield storageRef.delete();
                }
            }
            catch (fileError) {
                console.warn(`Failed to delete audio file: ${recording.audioUrl}`, fileError);
            }
        }
        // Get deleted recording details for response
        const deletedRecordings = recordings.map((r) => {
            var _a, _b;
            return ({
                id: r._id,
                promptText: ((_a = r.prompt) === null || _a === void 0 ? void 0 : _a.text_id) || ((_b = r.prompt) === null || _b === void 0 ? void 0 : _b.prompt) || "Unknown",
            });
        });
        yield user.save();
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
    }
    catch (error) {
        console.error("Error deleting recordings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
