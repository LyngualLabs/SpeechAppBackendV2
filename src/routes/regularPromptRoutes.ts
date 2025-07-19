import { Router } from "express";
import multer from "multer";
import {
  addBulkPrompts,
  getPrompts,
  uploadPrompt,
  getUserPrompts,
  getPromptsByUser,
  getVerifiedPromptsByUser,
  getPromptById,
  verifyPrompts,
  deletePrompts,
  getEnhancedRegularPromptStats,
} from "../controllers/regularPromptController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get("/stats", getEnhancedRegularPromptStats);
router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);
router.get("/get-prompt", getPrompts);
router.get("/get-prompt/:id", getPromptById);
router.get("/my-recordings", getUserPrompts);
router.get("/user-recordings/:userId", getPromptsByUser);
router.get("/verified-recordings/:userId", getVerifiedPromptsByUser);
router.post("/upload", upload.single("audioFile"), uploadPrompt);
router.put("/verify/:userId", verifyPrompts);
router.delete("/delete/:userId", deletePrompts);

export default router;
