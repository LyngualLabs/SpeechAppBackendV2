import { Router } from "express";
import multer from "multer";
import { addBulkPrompts } from "../controllers/regularPromptController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/bulk", upload.single("promptsFile"), addBulkPrompts);

export default router;
