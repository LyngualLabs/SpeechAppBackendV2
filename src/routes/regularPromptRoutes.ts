import { Router } from "express";
import multer from "multer";
import { addBulkPrompts, getPrompts } from "../controllers/regularPromptController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);
router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);
router.get("/get-prompt", getPrompts);


export default router;
