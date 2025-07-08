"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const regularPromptController_1 = require("../controllers/regularPromptController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.use(authMiddleware_1.protect);
// @desc Add bulk prompts
// @route POST /api/r-prompts/bulk
// @access Private
router.post("/bulk", upload.single("promptsFile"), regularPromptController_1.addBulkPrompts);
// @desc Get all prompts
// @route GET /api/r-prompts/get-prompt
router.get("/get-prompt", regularPromptController_1.getPrompts);
// @desc Get prompt by MongoDB _id or custom prompt_id
// @route GET /api/r-prompts/get-prompt/:id
// @access Private
// @param id: [TEXT] - The MongoDB ObjectId of the prompt (e.g., "674a1b2c3d4e5f6789012345") or custom prompt_id (e.g., "1-300")
router.get("/get-prompt/:id", regularPromptController_1.getPromptById);
// @desc Get user prompts
// @route GET /api/r-prompts/my-recordings
// @access Private
router.get("/my-recordings", regularPromptController_1.getUserPrompts);
// @desc Upload prompt recording
// @route POST /api/r-prompts/upload
// @access Private
// @body audioFile: [FILE] - Select your audio file (mp3, wav, etc.)
// @body prompt_id: [TEXT] - The MongoDB ObjectId of the prompt (e.g., "674a1b2c3d4e5f6789012345")
router.post("/upload", upload.single("audioFile"), regularPromptController_1.uploadPrompt);
// @desc Verify user recordings
// @route PUT /api/r-prompts/verify/:userId
// @access Private (Admin only)
router.put("/verify/:userId", regularPromptController_1.verifyPrompts);
// @desc Delete user recordings
// @route DELETE /api/r-prompts/delete/:userId
// @access Private (Admin only)
router.delete("/delete/:userId", regularPromptController_1.deletePrompts);
exports.default = router;
