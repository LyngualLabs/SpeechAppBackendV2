"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = exports.getAuthStatus = exports.signIn = exports.signUp = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = require("../models/User");
const generateToken = (id) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }
    return jsonwebtoken_1.default.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
    });
};
let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/;
exports.signUp = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { fullname, email, password } = req.body;
    console.log("Request body:", req.body);
    try {
        if (!req.body) {
            return res.status(400).json({ message: "Request body is missing" });
        }
        if (!emailRegex.test(email)) {
            return res.status(403).json({ message: "Email is Invalid" });
        }
        if (!passwordRegex.test(password)) {
            return res.status(403).json({
                message: "Password should be 6-20 characters, with a numeric, 1 lowercase and 1 uppercase letter",
            });
        }
        const userExists = yield User_1.User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }
        const user = yield User_1.User.create({
            fullname,
            email,
            password,
        });
        const responseData = {
            success: true,
            fullname: user.fullname,
            email: user.email,
        };
        res.status(201).json(responseData);
    }
    catch (err) {
        res.status(500).json({ message: "An error occurred" });
        console.log(err);
    }
}));
exports.signIn = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        const user = (yield User_1.User.findOne({ email }));
        if (!user) {
            return res
                .status(403)
                .json({ message: "No User with that Email Address" });
        }
        // Check if password is correct
        const passwordIsCorrect = yield bcryptjs_1.default.compare(password, user.password);
        if (!passwordIsCorrect) {
            return res.status(400).json({ message: "Invalid email or password" });
        }
        // Generate Token
        const token = generateToken(user._id.toString());
        // Dynamic cookie settings based on environment
        const isProduction = process.env.NODE_ENV === "production";
        // Properly detect HTTPS behind proxy
        const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
        // Log environment details
        console.log("Environment:", process.env.NODE_ENV);
        console.log("Request protocol:", req.protocol);
        console.log("Request secure:", req.secure);
        console.log("X-Forwarded-Proto:", req.headers["x-forwarded-proto"]);
        const cookieOptions = {
            path: "/",
            httpOnly: true,
            expires: new Date(Date.now() + 1000 * 86400), // 1 day
            sameSite: isProduction && isSecure ? "none" : "lax",
            secure: isProduction && isSecure, // Only secure in production (HTTPS)
        };
        res.cookie("token", token, cookieOptions);
        const responseData = {
            success: true,
            fullname: user.fullname,
            email: user.email,
            token: token,
        };
        res.status(200).json(responseData);
    }
    catch (err) {
        res.status(500).json({ message: "Server Error" });
        console.log(err);
    }
}));
exports.getAuthStatus = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get token from cookie
        const token = req.cookies.token;
        console.log(token);
        if (!token) {
            return res.status(401).json({
                success: false,
                isAuthenticated: false,
                message: "Not authenticated token",
            });
        }
        // Verify token
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        // Get user (exclude password)
        const user = yield User_1.User.findById(decoded.id).select("-password");
        if (!user) {
            return res.status(401).json({
                success: false,
                isAuthenticated: false,
                message: "User not found",
            });
        }
        return res.status(200).json({
            success: true,
            isAuthenticated: true,
            user: {
                fullname: user.fullname,
                email: user.email,
            },
        });
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({
            success: false,
            isAuthenticated: false,
            message: "Invalid authentication--",
        });
    }
}));
exports.getUser = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a._id)) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const user = yield User_1.User.findById(req.user._id).select("-password");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }
        const responseData = {
            success: true,
            id: user._id,
            fullname: user.fullname,
            email: user.email,
            role: user.role || "user",
            personalInfo: user.personalInfo || null,
            languages: user.languages || [],
            token: req.cookies.token || token || null,
        };
        res.status(200).json(responseData);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An error occurred";
        res.status(500).json({
            success: false,
            message: errorMessage,
        });
    }
}));
