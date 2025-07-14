"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegularRecording = void 0;
const mongoose_1 = require("mongoose");
const RegularRecordingSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    prompt: {
        type: mongoose_1.Schema.Types.ObjectId,
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
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});
// Add indexes for better query performance
RegularRecordingSchema.index({ user: 1, prompt: 1 });
RegularRecordingSchema.index({ status: 1 });
exports.RegularRecording = (0, mongoose_1.model)("RegularRecording", RegularRecordingSchema);
