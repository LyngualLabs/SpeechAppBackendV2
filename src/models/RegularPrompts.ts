import { Schema, model, Document } from "mongoose";

// Interface for language tags subdocument
interface ILanguageTag {
  language: string;
  word: string;
}

// Main interface for RegularPrompt document
export interface IRegularPrompt extends Document {
  text_id: string;
  prompt: string;
  prompt_id: string;
  emotions?: string | null;
  language_tags: ILanguageTag[];
  domain?: string | null;
  maxUsers: number;
  userCount: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const RegularPromptSchema = new Schema<IRegularPrompt>(
  {
    text_id: {
      type: String,
      required: true,
      trim: true,
    },
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
    emotions: {
      type: String,
      required: false,
      default: null,
    },
    language_tags: [
      {
        language: {
          type: String,
          required: true,
        },
        word: {
          type: String,
          required: true,
        },
      },
    ],
    domain: {
      type: String,
      required: false,
      default: null,
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

export const RegularPrompt = model<IRegularPrompt>(
  "RegularPrompt",
  RegularPromptSchema
);
