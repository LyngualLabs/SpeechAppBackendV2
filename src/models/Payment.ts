import { Schema, model, Document } from "mongoose";

export interface IPayment extends Document {
  user: Schema.Types.ObjectId;
  naturalRecordings: Schema.Types.ObjectId[]; // Natural recording IDs
  regularRecordings: Schema.Types.ObjectId[]; // Regular recording IDs
  totalRecordingCount: number; // Should be 50 or multiple of 50
  naturalCount: number; // Number of natural recordings in this payment
  regularCount: number; // Number of regular recordings in this payment
  paymentAmount: number;
  paymentStatus: "pending" | "processing" | "paid" | "failed";
  paymentMethod?: string;
  paymentReference?: string;
  paymentDate?: Date;
  adminNotes?: string; // Admin can add notes when processing
  processedBy?: Schema.Types.ObjectId; // Which admin processed the payment
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    naturalRecordings: [{
      type: Schema.Types.ObjectId,
      ref: "NaturalRecording",
    }],
    regularRecordings: [{
      type: Schema.Types.ObjectId,
      ref: "RegularRecording",
    }],
    totalRecordingCount: {
      type: Number,
      required: true,
      min: 2, // Changed from 500 to 2
    },
    naturalCount: {
      type: Number,
      default: 0,
    },
    regularCount: {
      type: Number,
      default: 0,
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "paid", "failed"],
      default: "pending",
    },
    paymentMethod: String,
    paymentReference: String,
    paymentDate: Date,
    adminNotes: String,
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add indexes
PaymentSchema.index({ user: 1, paymentStatus: 1 });
PaymentSchema.index({ createdAt: -1 });

export const Payment = model<IPayment>("Payment", PaymentSchema);