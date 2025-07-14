import { Router } from "express";
import multer from "multer";
import {
  addBulkPrompts,
  getPrompts,
  uploadPrompt,
  getUserPrompts,
  getPromptsByUser,
  getPromptById,
  verifyPrompts,
  deletePrompts,
  getEnhancedRegularPromptStats,
} from "../controllers/regularPromptController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

// @desc Get enhanced regular prompt stats
// @route GET /api/r-prompts/enhanced-stats
// @access Private
router.get("/stats", getEnhancedRegularPromptStats);

// @desc Add bulk prompts
// @route POST /api/r-prompts/bulk
// @access Private
router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);
// @desc Get all prompts
// @route GET /api/r-prompts/get-prompt
router.get("/get-prompt", getPrompts);

// @desc Get prompt by MongoDB _id or custom prompt_id
// @route GET /api/r-prompts/get-prompt/:id
// @access Private
// @param id: [TEXT] - The MongoDB ObjectId of the prompt (e.g., "674a1b2c3d4e5f6789012345") or custom prompt_id (e.g., "1-300")
router.get("/get-prompt/:id", getPromptById);

// @desc Get user prompts
// @route GET /api/r-prompts/my-recordings
// @access Private
router.get("/my-recordings", getUserPrompts);

// @desc Get user prompts by user ID
// @route GET /api/r-prompts/user-recordings/:userId
// @access Private
// @param userId: [TEXT] - The MongoDB ObjectId of the user
router.get("/user-recordings/:userId", getPromptsByUser);

// @desc Upload prompt recording
// @route POST /api/r-prompts/upload
// @access Private
// @body audioFile: [FILE] - Select your audio file (mp3, wav, etc.)
// @body prompt_id: [TEXT] - The MongoDB ObjectId of the prompt (e.g., "674a1b2c3d4e5f6789012345")
router.post("/upload", upload.single("audioFile"), uploadPrompt);

// @desc Verify user recordings
// @route PUT /api/r-prompts/verify/:userId
// @access Private (Admin only)
router.put("/verify/:userId", verifyPrompts);

// @desc Delete user recordings
// @route DELETE /api/r-prompts/delete/:userId
// @access Private (Admin only)
router.delete("/delete/:userId", deletePrompts);

export default router;
