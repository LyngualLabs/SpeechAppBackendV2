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
  importUsers,
  updateUserPayment,
  getPaymentStats,
  getUserPaymentDetails,
} from "../controllers/userController";
import { protect } from "../middleware/authMiddleware";

const router = Router();
router.post("/import", importUsers);

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

// Payment related routes
router.put("/payment/:userId", updateUserPayment);
router.get("/payment/:userId", getUserPaymentDetails);
router.get("/payment/stats", getPaymentStats);

export default router;
