import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { User } from "../models/User";
import { Payment } from "../models/Payment";
import { NaturalRecording } from "../models/NaturalRecordings";
import { RegularRecording } from "../models/RegularRecordings";

interface AuthRequest extends Request {
  user?: {
    _id: string;
    fullname: string;
    email: string;
  };
}

// 1. Get payment data and eligibility
export const getPaymentData = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?._id;

      // Count verified recordings not yet paid for from both types
      const naturalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: true,
        isPaidFor: false,
      });

      const regularCount = await RegularRecording.countDocuments({
        user: userId,
        isVerified: true,
        isPaidFor: false,
      });

      const totalVerified = naturalCount + regularCount;
      const eligibleBatches = Math.floor(totalVerified / 500);
      const remainingRecordings = totalVerified % 500;

      // Get payment history
      const payments = await Payment.find({ user: userId })
        .sort({ createdAt: -1 })
        .lean();

      // Calculate summary
      const totalEarned = payments
        .filter((p) => p.paymentStatus === "paid")
        .reduce((sum, p) => sum + p.paymentAmount, 0);

      const pendingAmount = payments
        .filter((p) => p.paymentStatus === "pending")
        .reduce((sum, p) => sum + p.paymentAmount, 0);

      const totalRecordingsPaid = payments
        .filter((p) => p.paymentStatus === "paid")
        .reduce((sum, p) => sum + p.totalRecordingCount, 0);

      res.status(200).json({
        success: true,
        data: {
          currentEligibility: {
            breakdown: {
              naturalRecordings: naturalCount,
              regularRecordings: regularCount,
              totalVerified,
            },
            payment: {
              eligiblePayments: eligibleBatches,
              remainingRecordings,
              nextPaymentAt:
                remainingRecordings === 0 ? 0 : 500 - remainingRecordings,
              amountPerPayment: 1000, // Configure as needed
              canRequestPayment: totalVerified >= 500,
            },
          },
          paymentHistory: {
            payments: payments.map((p) => ({
              id: p._id,
              amount: p.paymentAmount,
              status: p.paymentStatus,
              breakdown: {
                total: p.totalRecordingCount,
                natural: p.naturalCount,
                regular: p.regularCount,
              },
              paymentReference: p.paymentReference,
              paymentMethod: p.paymentMethod,
              paymentDate: p.paymentDate,
              createdAt: p.createdAt,
            })),
            summary: {
              totalPayments: payments.length,
              totalEarned,
              pendingAmount,
              totalRecordingsPaid,
              paidPayments: payments.filter((p) => p.paymentStatus === "paid")
                .length,
              pendingPayments: payments.filter(
                (p) => p.paymentStatus === "pending"
              ).length,
            },
          },
        },
      });
    } catch (error) {
      console.error("Error fetching payment data:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

// 2. Create payment request for verified prompts
export const requestPayment = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?._id;
      const { paymentAmount = 1000 } = req.body;

      // Validate user
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get verified, unpaid recordings from both types
      const naturalRecordings = await NaturalRecording.find({
        user: userId,
        isVerified: true,
        isPaidFor: false,
      }).sort({ createdAt: 1 }); // Oldest first for fairness

      const regularRecordings = await RegularRecording.find({
        user: userId,
        isVerified: true,
        isPaidFor: false,
      }).sort({ createdAt: 1 }); // Oldest first for fairness

      // Combine and sort by creation date
      const allRecordings = [
        ...naturalRecordings.map((r) => ({ ...r.toObject(), type: "natural" })),
        ...regularRecordings.map((r) => ({ ...r.toObject(), type: "regular" })),
      ].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      if (allRecordings.length < 500) {
        res.status(400).json({
          success: false,
          error: `Insufficient verified recordings. You need ${
            500 - allRecordings.length
          } more recordings.`,
          data: {
            breakdown: {
              natural: naturalRecordings.length,
              regular: regularRecordings.length,
              total: allRecordings.length,
              required: 500,
              missing: 500 - allRecordings.length,
            },
          },
        });
        return;
      }

      // Take exactly 500 recordings (oldest first)
      const selectedRecordings = allRecordings.slice(0, 500);

      // Separate by type
      const selectedNatural = selectedRecordings.filter(
        (r) => r.type === "natural"
      );
      const selectedRegular = selectedRecordings.filter(
        (r) => r.type === "regular"
      );

      const naturalIds = selectedNatural.map((r) => r._id);
      const regularIds = selectedRegular.map((r) => r._id);

      // Create payment record
      const payment = new Payment({
        user: userId,
        naturalRecordings: naturalIds,
        regularRecordings: regularIds,
        totalRecordingCount: 500,
        naturalCount: selectedNatural.length,
        regularCount: selectedRegular.length,
        paymentAmount,
        paymentStatus: "pending",
      });

      await payment.save();

      // Mark recordings as included in payment
      if (naturalIds.length > 0) {
        await NaturalRecording.updateMany(
          { _id: { $in: naturalIds } },
          { isPaidFor: true, paymentId: payment._id }
        );
      }

      if (regularIds.length > 0) {
        await RegularRecording.updateMany(
          { _id: { $in: regularIds } },
          { isPaidFor: true, paymentId: payment._id }
        );
      }

      res.status(201).json({
        success: true,
        message: "Payment request created successfully",
        data: {
          payment: {
            id: payment._id,
            amount: payment.paymentAmount,
            status: payment.paymentStatus,
            breakdown: {
              totalRecordings: 500,
              naturalRecordings: selectedNatural.length,
              regularRecordings: selectedRegular.length,
            },
            createdAt: payment.createdAt,
          },
          user: {
            name: user.fullname,
            email: user.email,
          },
        },
      });
    } catch (error) {
      console.error("Payment request error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);
