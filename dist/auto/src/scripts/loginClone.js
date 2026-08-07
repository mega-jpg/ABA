"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function ask(question) {
    const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
async function main() {
    const cloneId = process.argv[2];
    if (!cloneId) {
        console.log("Usage: npm run login <clone_id>");
        console.log("Ví dụ: npm run login clone_a");
        process.exit(1);
    }
    const apiId = parseInt(process.env.TELEGRAM_API_ID ?? "", 10);
    const apiHash = process.env.TELEGRAM_API_HASH ?? "";
    if (!apiId || !apiHash) {
        console.error("❌ Thiếu TELEGRAM_API_ID / TELEGRAM_API_HASH trong .env");
        process.exit(1);
    }
    const clonesDir = path_1.default.resolve(process.env.CLONES_DIR ?? "./clones");
    await promises_1.default.mkdir(clonesDir, { recursive: true });
    const sessionPath = path_1.default.join(clonesDir, `${cloneId}.session`);
    let existingSession = "";
    try {
        existingSession = (await promises_1.default.readFile(sessionPath, "utf-8")).trim();
    }
    catch {
    }
    console.log(`\n🔐 Đăng nhập clone: ${cloneId}`);
    console.log(`   Session sẽ lưu tại: ${sessionPath}\n`);
    const client = new telegram_1.TelegramClient(new sessions_1.StringSession(existingSession), apiId, apiHash, { connectionRetries: 5 });
    await client.start({
        phoneNumber: async () => await ask("Số điện thoại (+84...): "),
        password: async () => await ask("Mật khẩu 2FA (Enter nếu không có): "),
        phoneCode: async () => await ask("Mã OTP Telegram gửi: "),
        onError: (err) => console.error(err),
    });
    const sessionStr = client.session.save();
    await promises_1.default.writeFile(sessionPath, sessionStr);
    const me = await client.getMe();
    console.log(`\n✅ Đăng nhập thành công: @${me.username ?? me.id}`);
    console.log(`   Session đã lưu: ${sessionPath}`);
    await client.disconnect();
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
