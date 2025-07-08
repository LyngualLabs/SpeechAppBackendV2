import { Router } from "express";
import {
  signUp,
  signIn,
  getAuthStatus,
  getUser,
  sendVerificationCode,
  verifyEmailCode,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post("/sign-up", signUp);
router.post("/sign-in", signIn);
router.get("/auth-status", getAuthStatus);
router.post("/send-verification-code/:email", sendVerificationCode);
router.post("/verify-email", verifyEmailCode);
router.post("/forgot-password/:email", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password/:email", resetPassword);

router.use(protect);
router.get("/me", protect, getUser);

export default router;
