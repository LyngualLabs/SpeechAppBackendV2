import { Schema, model, Document } from "mongoose";

// Interface for NaturalRecording document
export interface INaturalRecording extends Document {
  user: Schema.Types.ObjectId;
  prompt: Schema.Types.ObjectId;
  audioUrl: string;
  isVerified: boolean;
  prompt_answer: string;
  createdAt: Date;
  updatedAt: Date;
}

const NaturalRecordingSchema = new Schema<INaturalRecording>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    prompt: {
      type: Schema.Types.ObjectId,
      ref: "NaturalPrompt",
      required: true,
    },
    prompt_answer: {
        type: String,
    },
    audioUrl: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add indexes for better query performance
NaturalRecordingSchema.index({ user: 1, prompt: 1 });
NaturalRecordingSchema.index({ isVerified: 1 });

export const NaturalRecording = model<INaturalRecording>(
  "NaturalRecording",
  NaturalRecordingSchema
);