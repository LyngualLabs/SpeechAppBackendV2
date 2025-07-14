"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegularPrompt = void 0;
const mongoose_1 = require("mongoose");
const RegularPromptSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});
exports.RegularPrompt = (0, mongoose_1.model)("RegularPrompt", RegularPromptSchema);
