import { Schema, model, Document } from "mongoose";

// Interface for RegularRecording document
export interface IRegularRecording extends Document {
  user: Schema.Types.ObjectId;
  prompt: Schema.Types.ObjectId;
  audioUrl: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RegularRecordingSchema = new Schema<IRegularRecording>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    prompt: {
      type: Schema.Types.ObjectId,
      ref: "RegularPrompt",
      required: true,
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
RegularRecordingSchema.index({ user: 1, prompt: 1 });
RegularRecordingSchema.index({ status: 1 });

export const RegularRecording = model<IRegularRecording>(
  "RegularRecording",
  RegularRecordingSchema
);
