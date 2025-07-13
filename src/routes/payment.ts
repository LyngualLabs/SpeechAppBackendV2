import { Router } from "express";
import {
  getPaymentData,
  getEligibleUsers,
  getAllUsersStats,
  makePayment,
} from "../controllers/payment";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

// @desc Get user payment data and eligibility
// @route GET /api/payments/data
// @access Private

router.get("/data", getPaymentData);
router.get("/eligible-users", getEligibleUsers);
router.get("/users-stats", getAllUsersStats);
router.post("/make-payment", makePayment);

export default router;
