import { Router } from "express";
import multer from "multer";
import {
  addBulkPrompts,
  getPrompts,
  uploadPrompt,
  getUserPrompts,
} from "../controllers/naturalPromptController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

// @desc Add bulk natural prompts
// @route POST /api/n-prompts/bulk
// @access Private
router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);

// @desc Get available natural prompts
// @route GET /api/n-prompts/get-prompt
// @access Private
router.get("/get-prompt", getPrompts);

// @desc Get user natural prompt recordings
// @route GET /api/n-prompts/my-recordings
// @access Private
router.get("/my-recordings", getUserPrompts);

// @desc Upload natural prompt recording
// @route POST /api/n-prompts/upload
// @access Private
// @body audioFile: [FILE] - Select your audio file (mp3, wav, etc.)
// @body prompt_id: [TEXT] - The MongoDB ObjectId of the natural prompt
router.post("/upload", upload.single("audioFile"), uploadPrompt);

export default router;
