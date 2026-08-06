"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
}
exports.config = {
    telegram: {
        apiId: parseInt(requireEnv("TELEGRAM_API_ID"), 10),
        apiHash: requireEnv("TELEGRAM_API_HASH"),
    },
    redis: {
        host: process.env.REDIS_HOST ?? "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT ?? "6380", 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultChatId: process.env.DEFAULT_CHAT_ID ?? "",
    clonesDir: path_1.default.resolve(process.env.CLONES_DIR ?? "./clones"),
    queueName: "seeding-queue",
};
