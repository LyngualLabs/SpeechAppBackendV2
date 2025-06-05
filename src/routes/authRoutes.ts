import { Router } from "express";
import {
  signUp,
  signIn,
  getAuthStatus,
  getUser,
} from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post("/sign-up", signUp);
router.post("/sign-in", signIn);
router.get("/auth-status", getAuthStatus);

router.use(protect);
router.get("/me", protect, getUser);

export default router;
