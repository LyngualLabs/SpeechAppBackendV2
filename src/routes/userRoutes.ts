import { Router } from "express";
import {
  getMyDetails,
  getUsers,
  getUserById,
  createUser,
  toggleUserSuspension,
  signWaiver,
  updateDetails,
  toggleAdminRole
} from "../controllers/userController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

router.get("/my-details", getMyDetails);
router.get("/all-users", getUsers);
router.get("/:userId", getUserById);
router.post("/", createUser);
router.put("/toggle-suspension/:userId", toggleUserSuspension);
router.post("/sign-waiver", signWaiver);
router.put("/update-details", updateDetails);
router.put("/toggle-admin/:userId", toggleAdminRole);

export default router;
