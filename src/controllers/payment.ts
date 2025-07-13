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

// 1. Get payment data and eligibility (updated for 50 threshold)
export const getPaymentData = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?._id;
      const PAYMENT_THRESHOLD = 2; // 50 recordings per payment
      const AMOUNT_PER_PAYMENT = 200; // Configure as needed

      // Count ALL recordings from both types
      const totalNaturalRecordings = await NaturalRecording.countDocuments({
        user: userId,
      });

      const totalRegularRecordings = await RegularRecording.countDocuments({
        user: userId,
      });

      // Count verified recordings not yet paid for
      const unpaidVerifiedNaturalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: true,
        // isPaidFor: false,
      });

      const unpaidVerifiedRegularCount = await RegularRecording.countDocuments({
        user: userId,
        isVerified: true,
        // isPaidFor: false,
      });

      // Count all verified recordings (including paid ones)
      const allVerifiedNaturalCount = await NaturalRecording.countDocuments({
        user: userId,
        isVerified: true,
      });

      const allVerifiedRegularCount = await RegularRecording.countDocuments({
        user: userId,
        isVerified: true,
      });

      const totalUnpaidVerified =
        unpaidVerifiedNaturalCount + unpaidVerifiedRegularCount;
      const totalAllVerified =
        allVerifiedNaturalCount + allVerifiedRegularCount;
      const eligiblePayments = Math.floor(
        totalUnpaidVerified / PAYMENT_THRESHOLD
      );
      const remainingRecordings = totalUnpaidVerified % PAYMENT_THRESHOLD;

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

      res.status(200).json({
        success: true,
        data: {
          recordingsOverview: {
            total: {
              natural: totalNaturalRecordings,
              regular: totalRegularRecordings,
              combined: totalNaturalRecordings + totalRegularRecordings,
            },
            verified: {
              natural: allVerifiedNaturalCount,
              regular: allVerifiedRegularCount,
              combined: totalAllVerified,
            },
            unpaidVerified: {
              natural: unpaidVerifiedNaturalCount,
              regular: unpaidVerifiedRegularCount,
              total: totalUnpaidVerified,
            },
          },
          paymentEligibility: {
            threshold: PAYMENT_THRESHOLD,
            eligiblePayments: eligiblePayments,
            remainingRecordings: remainingRecordings,
            nextPaymentAt:
              remainingRecordings === 0
                ? 0
                : PAYMENT_THRESHOLD - remainingRecordings,
            amountPerPayment: AMOUNT_PER_PAYMENT,
            canRequestPayment: totalUnpaidVerified >= PAYMENT_THRESHOLD,
            potentialEarnings: eligiblePayments * AMOUNT_PER_PAYMENT,
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
              paymentDate: p.paymentDate,
              createdAt: p.createdAt,
            })),
            summary: {
              totalPayments: payments.length,
              totalEarned,
              pendingAmount,
              paidPayments: payments.filter((p) => p.paymentStatus === "paid")
                .length,
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

// 2. Get all users eligible for payment (Admin only)
export const getEligibleUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const PAYMENT_THRESHOLD = 2; // 2 recordings per payment for testing
      const AMOUNT_PER_PAYMENT = 200; // Configure as needed

      // Get all users
      const users = await User.find({}, "fullname email").lean();
      const eligibleUsers = [];

      console.log(
        `Checking ${users.length} users for eligibility with threshold: ${PAYMENT_THRESHOLD}`
      );

      for (const user of users) {
        // Count verified, unpaid recordings
        const unpaidVerifiedNaturalCount =
          await NaturalRecording.countDocuments({
            user: user._id,
            isVerified: true,
            isPaidFor: { $ne: true }, // Use $ne: true instead of false to catch null/undefined
          });

        const unpaidVerifiedRegularCount =
          await RegularRecording.countDocuments({
            user: user._id,
            isVerified: true,
            isPaidFor: { $ne: true }, // Use $ne: true instead of false to catch null/undefined
          });

        const totalUnpaidVerified =
          unpaidVerifiedNaturalCount + unpaidVerifiedRegularCount;

        // Debug logging
        console.log(
          `User: ${user.fullname}, Natural: ${unpaidVerifiedNaturalCount}, Regular: ${unpaidVerifiedRegularCount}, Total: ${totalUnpaidVerified}`
        );

        // Check if user is eligible for payment (has at least threshold verified, unpaid recordings)
        if (totalUnpaidVerified >= PAYMENT_THRESHOLD) {
          // Check if user already has pending payment
          const pendingPayment = await Payment.findOne({
            user: user._id,
            paymentStatus: "pending",
          });

          const eligibleBatches = Math.floor(
            totalUnpaidVerified / PAYMENT_THRESHOLD
          );
          const potentialAmount = eligibleBatches * AMOUNT_PER_PAYMENT;

          eligibleUsers.push({
            userId: user._id,
            fullname: user.fullname,
            email: user.email,
            recordings: {
              natural: unpaidVerifiedNaturalCount,
              regular: unpaidVerifiedRegularCount,
              total: totalUnpaidVerified,
            },
            eligibleBatches,
            potentialAmount,
            hasPendingPayment: !!pendingPayment,
            pendingPaymentId: pendingPayment?._id || null,
          });

          console.log(
            `✅ User ${user.fullname} is eligible with ${totalUnpaidVerified} recordings`
          );
        } else {
          console.log(
            `❌ User ${user.fullname} not eligible - only ${totalUnpaidVerified} recordings (need ${PAYMENT_THRESHOLD})`
          );
        }
      }

      // Sort by total verified recordings (highest first)
      eligibleUsers.sort((a, b) => b.recordings.total - a.recordings.total);

      console.log(`Found ${eligibleUsers.length} eligible users`);

      res.status(200).json({
        success: true,
        data: {
          threshold: PAYMENT_THRESHOLD,
          amountPerBatch: AMOUNT_PER_PAYMENT,
          totalEligibleUsers: eligibleUsers.length,
          usersWithoutPendingPayment: eligibleUsers.filter(
            (u) => !u.hasPendingPayment
          ).length,
          eligibleUsers,
        },
      });
    } catch (error) {
      console.error("Error fetching eligible users:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

// Replace the three separate functions with this single one
export const makePayment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.body;
      const adminId = (req as any).user?._id;
      const PAYMENT_THRESHOLD = 2;
      const AMOUNT_PER_PAYMENT = 200;

      // Validate inputs
      if (!userId) {
        res.status(400).json({
          success: false,
          error: "User ID is required",
        });
        return;
      }

      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // // Check if user already has pending payment
      // const existingPayment = await Payment.findOne({
      //   user: userId,
      //   paymentStatus: "pending"
      // });

      // if (existingPayment) {
      //   res.status(400).json({
      //     success: false,
      //     error: "User already has a pending payment",
      //     pendingPaymentId: existingPayment._id
      //   });
      //   return;
      // }

      // Get verified, unpaid recordings (using same query as getEligibleUsers)
      const naturalRecordings = await NaturalRecording.find({
        user: userId,
        isVerified: true,
        isPaidFor: { $ne: true }, // Same as getEligibleUsers xxxx
      }).sort({ createdAt: 1 }); // Oldest first

      const regularRecordings = await RegularRecording.find({
        user: userId,
        isVerified: true,
        isPaidFor: { $ne: true }, // Same as getEligibleUsers xxxx
      }).sort({ createdAt: 1 }); // Oldest first

      const totalUnpaidVerified =
        naturalRecordings.length + regularRecordings.length;

      // Check if user is eligible
      if (totalUnpaidVerified < PAYMENT_THRESHOLD) {
        res.status(400).json({
          success: false,
          error: `User has only ${totalUnpaidVerified} verified unpaid recordings. Minimum required: ${PAYMENT_THRESHOLD}`,
          data: {
            current: totalUnpaidVerified,
            required: PAYMENT_THRESHOLD,
            missing: PAYMENT_THRESHOLD - totalUnpaidVerified,
          },
        });
        return;
      }

      // Calculate payment details
      const eligibleBatches = Math.floor(
        totalUnpaidVerified / PAYMENT_THRESHOLD
      );
      const recordingsToInclude = eligibleBatches * PAYMENT_THRESHOLD;
      const totalPaymentAmount = eligibleBatches * AMOUNT_PER_PAYMENT;

      // Combine and sort by creation date (fairness)
      const allRecordings = [
        ...naturalRecordings.map((r) => ({ ...r.toObject(), type: "natural" })),
        ...regularRecordings.map((r) => ({ ...r.toObject(), type: "regular" })),
      ].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Take the calculated number of recordings
      const selectedRecordings = allRecordings.slice(0, recordingsToInclude);
      const selectedNatural = selectedRecordings.filter(
        (r) => r.type === "natural"
      );
      const selectedRegular = selectedRecordings.filter(
        (r) => r.type === "regular"
      );

      const naturalIds = selectedNatural.map((r) => r._id);
      const regularIds = selectedRegular.map((r) => r._id);

      // Create payment record and mark as paid immediately
      const payment = new Payment({
        user: userId,
        naturalRecordings: naturalIds,
        regularRecordings: regularIds,
        totalRecordingCount: recordingsToInclude,
        naturalCount: selectedNatural.length,
        regularCount: selectedRegular.length,
        paymentAmount: totalPaymentAmount,
        paymentStatus: "paid",
        paymentDate: new Date(),
        processedBy: adminId,
      });

      await payment.save();

      res.status(201).json({
        success: true,
        message: "Payment completed successfully",
        data: {
          payment: {
            id: payment._id,
            amount: payment.paymentAmount,
            batches: eligibleBatches,
            breakdown: {
              totalRecordings: recordingsToInclude,
              naturalRecordings: selectedNatural.length,
              regularRecordings: selectedRegular.length,
            },
            user: {
              id: user._id,
              name: user.fullname,
              email: user.email,
            },
            paymentMethod: payment.paymentMethod,
            paymentReference: payment.paymentReference,
            paymentDate: payment.paymentDate,
            adminNotes: payment.adminNotes,
          },
        },
      });
    } catch (error) {
      console.error("Payment creation error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

// Keep the getAllPayments for viewing payment history
export const getAllPayments = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;

      // Get payments with pagination
      const payments = await Payment.find({})
        .populate("user", "fullname email")
        .populate("processedBy", "fullname email")
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const totalPayments = await Payment.countDocuments({});

      // Get summary statistics
      const totalPaid = await Payment.aggregate([
        {
          $match: { paymentStatus: "paid" },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$paymentAmount" },
            totalRecordings: { $sum: "$totalRecordingCount" },
            count: { $sum: 1 },
          },
        },
      ]);

      const stats =
        totalPaid.length > 0
          ? totalPaid[0]
          : { totalAmount: 0, totalRecordings: 0, count: 0 };

      res.status(200).json({
        success: true,
        data: {
          payments: payments.map((p) => ({
            id: p._id,
            user: p.user,
            amount: p.paymentAmount,
            status: p.paymentStatus,
            breakdown: {
              total: p.totalRecordingCount,
              natural: p.naturalCount,
              regular: p.regularCount,
            },
            paymentMethod: p.paymentMethod,
            paymentReference: p.paymentReference,
            adminNotes: p.adminNotes,
            processedBy: p.processedBy,
            paymentDate: p.paymentDate,
            createdAt: p.createdAt,
          })),
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(totalPayments / Number(limit)),
            totalRecords: totalPayments,
          },
          statistics: {
            totalPayments: stats.count,
            totalAmountPaid: stats.totalAmount,
            totalRecordingsPaid: stats.totalRecordings,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

// 6. Get all users with their recording statistics (Admin only)
export const getAllUsersStats = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Get all users
      const users = await User.find({}, "fullname email createdAt").lean();
      const usersStats = [];

      for (const user of users) {
        // Count natural recordings
        const totalNaturalRecordings = await NaturalRecording.countDocuments({
          user: user._id,
        });

        const verifiedNaturalRecordings = await NaturalRecording.countDocuments(
          {
            user: user._id,
            isVerified: true,
          }
        );

        // Count regular recordings
        const totalRegularRecordings = await RegularRecording.countDocuments({
          user: user._id,
        });

        const verifiedRegularRecordings = await RegularRecording.countDocuments(
          {
            user: user._id,
            isVerified: true,
          }
        );

        // Calculate totals
        const totalRecordings = totalNaturalRecordings + totalRegularRecordings;
        const totalVerifiedRecordings =
          verifiedNaturalRecordings + verifiedRegularRecordings;

        // Check payment status
        const totalPaidRecordings = await Payment.aggregate([
          {
            $match: {
              user: user._id,
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: null,
              totalRecordings: { $sum: "$totalRecordingCount" },
            },
          },
        ]);

        const paidRecordingsCount =
          totalPaidRecordings.length > 0
            ? totalPaidRecordings[0].totalRecordings
            : 0;

        usersStats.push({
          userId: user._id,
          fullname: user.fullname,
          email: user.email,
          joinedDate: user.createdAt,
          recordings: {
            natural: {
              total: totalNaturalRecordings,
              verified: verifiedNaturalRecordings,
              unverified: totalNaturalRecordings - verifiedNaturalRecordings,
            },
            regular: {
              total: totalRegularRecordings,
              verified: verifiedRegularRecordings,
              unverified: totalRegularRecordings - verifiedRegularRecordings,
            },
            combined: {
              total: totalRecordings,
              verified: totalVerifiedRecordings,
              unverified: totalRecordings - totalVerifiedRecordings,
              paid: paidRecordingsCount,
              unpaidVerified: totalVerifiedRecordings - paidRecordingsCount,
            },
          },
        });
      }

      // Sort by total verified recordings (highest first)
      usersStats.sort(
        (a, b) =>
          b.recordings.combined.verified - a.recordings.combined.verified
      );

      // Calculate summary statistics
      const summary = {
        totalUsers: usersStats.length,
        totalRecordings: usersStats.reduce(
          (sum, user) => sum + user.recordings.combined.total,
          0
        ),
        totalVerifiedRecordings: usersStats.reduce(
          (sum, user) => sum + user.recordings.combined.verified,
          0
        ),
        totalNaturalRecordings: usersStats.reduce(
          (sum, user) => sum + user.recordings.natural.total,
          0
        ),
        totalRegularRecordings: usersStats.reduce(
          (sum, user) => sum + user.recordings.regular.total,
          0
        ),
        totalVerifiedNatural: usersStats.reduce(
          (sum, user) => sum + user.recordings.natural.verified,
          0
        ),
        totalVerifiedRegular: usersStats.reduce(
          (sum, user) => sum + user.recordings.regular.verified,
          0
        ),
        totalPaidRecordings: usersStats.reduce(
          (sum, user) => sum + user.recordings.combined.paid,
          0
        ),
        totalUnpaidVerified: usersStats.reduce(
          (sum, user) => sum + user.recordings.combined.unpaidVerified,
          0
        ),
        usersWithRecordings: usersStats.filter(
          (user) => user.recordings.combined.total > 0
        ).length,
        usersWithVerifiedRecordings: usersStats.filter(
          (user) => user.recordings.combined.verified > 0
        ).length,
      };

      res.status(200).json({
        success: true,
        data: {
          summary,
          users: usersStats,
        },
      });
    } catch (error) {
      console.error("Error fetching users stats:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);
