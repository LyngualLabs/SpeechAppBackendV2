import { Router } from "express";
import {
  getUsers,
  createUser,
  toggleUserSuspension,
  signWaiver,
  updateDetails,
} from "../controllers/userController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

router.get("/all-users", getUsers);
router.post("/", createUser);
router.put("/toggle-suspension/:userId", toggleUserSuspension);
router.post("/sign-waiver", signWaiver);
router.put("/update-details", updateDetails);

export default router;
