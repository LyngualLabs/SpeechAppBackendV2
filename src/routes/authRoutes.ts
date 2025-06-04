import { Router } from "express";
import { signUp, signIn, getAuthStatus } from "../controllers/authController";

const router = Router();

router.post("/sign-up", signUp);
router.post("/sign-in", signIn);
router.get("/auth-status", getAuthStatus);

export default router;
