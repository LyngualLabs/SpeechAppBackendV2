import { Router } from "express";
import {
  getMyDetails,
  getUsers,
  getUserById,
  createUser,
  toggleUserSuspension,
  signWaiver,
  updateDetails,
  toggleAdminRole,
  exportAllUsersData,
} from "../controllers/userController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

router.get("/my-details", getMyDetails);
router.get("/all-users", getUsers);
router.get("/single-user/:userId", getUserById);
router.post("/", createUser);
router.put("/toggle-suspend/:userId", toggleUserSuspension);
router.post("/sign-waiver", signWaiver);
router.put("/update-details", updateDetails);
router.put("/toggle-admin/:userId", toggleAdminRole);
router.get("/export-all-data", exportAllUsersData);
export default router;
