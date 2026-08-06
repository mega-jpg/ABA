"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Lưu session string vào clones/{id}.session
 * Usage: npm run import:session clone_a "1AgAOMTQ5..."
 *    hoặc: echo "1AgA..." | npm run import:session clone_a
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function readStdin() {
    const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
    for await (const line of rl) {
        lines.push(line);
    }
    return lines.join("").trim();
}
async function main() {
    const cloneId = process.argv[2];
    let sessionStr = process.argv[3]?.trim() ?? "";
    if (!cloneId) {
        console.log('Usage: npm run import:session <clone_id> ["session_string"]');
        console.log('   hoặc: echo "1AgA..." | npm run import:session clone_a');
        process.exit(1);
    }
    if (!sessionStr && !process.stdin.isTTY) {
        sessionStr = await readStdin();
    }
    if (!sessionStr) {
        console.error("❌ Thiếu session string");
        process.exit(1);
    }
    if (!sessionStr.startsWith("1")) {
        console.warn("⚠️  Session GramJS thường bắt đầu bằng '1' — kiểm tra lại chuỗi");
    }
    const clonesDir = path_1.default.resolve(process.env.CLONES_DIR ?? "./clones");
    await promises_1.default.mkdir(clonesDir, { recursive: true });
    const sessionPath = path_1.default.join(clonesDir, `${cloneId}.session`);
    await promises_1.default.writeFile(sessionPath, sessionStr);
    console.log(`✅ Đã lưu session cho "${cloneId}"`);
    console.log(`   File: ${sessionPath}`);
    console.log(`   Test: npm run test:session ${cloneId}`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
