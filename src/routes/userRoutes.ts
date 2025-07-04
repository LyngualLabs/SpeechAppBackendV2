import { Router } from "express";
import { getUsers, createUser } from "../controllers/userController";

const router = Router();

router.get("/all-users", getUsers);
router.post("/", createUser);

export default router;
