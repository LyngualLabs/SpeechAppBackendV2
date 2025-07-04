"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const regularPromptRoutes_1 = __importDefault(require("./routes/regularPromptRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
// Load environment variables
dotenv_1.default.config();
// Initialize Express app
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// CORS configuration
app.use((0, cors_1.default)({
    origin: [
        "http://localhost:5173",
        "https://ambitious-mushroom-0397fd710.6.azurestaticapps.net",
        "https://www.ambitious-mushroom-0397fd710.6.azurestaticapps.net",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
    ],
}));
// Middleware
app.use(express_1.default.json());
app.use(body_parser_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(body_parser_1.default.urlencoded({ extended: true }));
app.set('trust proxy', true);
// Use routes
app.use("/api/v2/auth", authRoutes_1.default);
app.use("/api/v2/r-prompts", regularPromptRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("Error: MONGO_URI environment variable is not defined.");
    process.exit(1);
}
mongoose_1.default
    .connect(MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));
// Basic route
app.get("/", (req, res) => {
    res.send("SpeechApp By LyngualLabs...");
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
