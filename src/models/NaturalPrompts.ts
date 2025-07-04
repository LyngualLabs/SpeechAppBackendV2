import { Schema, model, Document } from "mongoose";

// Main interface for NaturalPrompt document
export interface INaturalPrompt extends Document {
  prompt: string;
  prompt_id: string;
  maxUsers: number;
  userCount: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const NaturalPromptSchema = new Schema<INaturalPrompt>(
  {
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    prompt_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    maxUsers: {
      type: Number,
      default: 3,
      min: 1,
    },
    userCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

export const NaturalPrompt = model<INaturalPrompt>(
  "NaturalPrompt",
  NaturalPromptSchema
);
