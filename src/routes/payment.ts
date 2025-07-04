import { Router } from "express";
import { getPaymentData, requestPayment } from "../controllers/payment";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

// @desc Get user payment data and eligibility
// @route GET /api/payments/data
// @access Private
router.get("/data", getPaymentData);

// @desc Request payment for 500 verified recordings
// @route POST /api/payments/request
// @access Private
// @body paymentAmount: [NUMBER] - Optional payment amount (default: 1000)
router.post("/request", requestPayment);

export default router;
