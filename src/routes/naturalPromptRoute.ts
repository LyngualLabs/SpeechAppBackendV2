import { Router } from "express";
import multer from "multer";
import {
  addBulkPrompts,
  getPrompts,
  checkDailyNaturalCount,
  uploadPrompt,
  getUserPrompts,
  getPromptsByUser,
  getMyVerifiedPrompts,
  getMyUnverifiedPrompts,
  getVerifiedPromptsByUser,
  getUnverifiedPromptsByUser,
  verifyPrompts,
  deletePrompts,
  getEnhancedNaturalPromptStats,
} from "../controllers/naturalPromptController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get("/stats", getEnhancedNaturalPromptStats);
router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);
router.get("/check-daily-count", checkDailyNaturalCount);
router.get("/get-prompt", getPrompts);
router.get("/my-recordings", getUserPrompts);
router.get("/my-verified-recordings", getMyVerifiedPrompts);
router.get("/my-unverified-recordings", getMyUnverifiedPrompts);
router.get("/user-recordings/:userId", getPromptsByUser);
router.get("/verified-recordings/:userId", getVerifiedPromptsByUser);
router.get("/unverified-recordings/:userId", getUnverifiedPromptsByUser);
router.post("/upload", upload.single("audioFile"), uploadPrompt);
router.put("/verify/:userId", verifyPrompts);
router.delete("/delete/:userId", deletePrompts);

export default router;
