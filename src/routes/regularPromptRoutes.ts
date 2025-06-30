import { Router } from "express";
import multer from "multer";
import { addBulkPrompts, getPrompts, uploadPrompt } from "../controllers/regularPromptController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

// @desc Add bulk prompts
// @route POST /api/regular-prompts/bulk
// @access Private
router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);
// @desc Get all prompts
// @route GET /api/regular-prompts/get-prompt
router.get("/get-prompt", getPrompts);
// @desc Upload prompt recording
// @route POST /api/regular-prompts/upload
// @access Private
router.post("/upload", upload.single("audioFile"), uploadPrompt);



export default router;
