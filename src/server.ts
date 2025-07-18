import express, { Application, Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/userRoutes";
import regularPromptRoutes from "./routes/regularPromptRoutes";
import naturalPromptRoute from "./routes/naturalPromptRoute";
import authRoutes from "./routes/authRoutes";
import paymentRoutes from "./routes/payment";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://ambitious-mushroom-0397fd710.6.azurestaticapps.net",
      "https://www.ambitious-mushroom-0397fd710.6.azurestaticapps.net",
    ],
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

app.set("trust proxy", true);

// Use routes
app.use("/api/v2/auth", authRoutes);
app.use("/api/v2/r-prompts", regularPromptRoutes);
app.use("/api/v2/n-prompts", naturalPromptRoute);
app.use("/api/v2/payments", paymentRoutes);
app.use("/api/v2/users", userRoutes);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Error: MONGO_URI environment variable is not defined.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Basic route
app.get("/", (req: Request, res: Response) => {
  res.send("SpeechApp By LyngualLabs...");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
