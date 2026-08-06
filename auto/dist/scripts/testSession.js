"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Kiểm tra 1 clone có kết nối được bằng session không
 * Usage: npm run test:session clone_a
 */
const dotenv_1 = __importDefault(require("dotenv"));
const clientPool_1 = require("../telegram/clientPool");
const sessionLoader_1 = require("../telegram/sessionLoader");
const config_1 = require("../config");
dotenv_1.default.config();
async function main() {
    const cloneId = process.argv[2];
    if (!cloneId) {
        console.log("Usage: npm run test:session <clone_id>");
        console.log("Ví dụ: npm run test:session clone_a");
        process.exit(1);
    }
    console.log(`\n=== Test session: ${cloneId} ===\n`);
    try {
        const resolved = await (0, sessionLoader_1.resolveCloneSession)(cloneId, config_1.config.clonesDir);
        console.log(`✅ Đọc session OK (nguồn: ${resolved.source})`);
        console.log(`   Độ dài: ${resolved.session.length} ký tự`);
        console.log(`   Proxy: ${resolved.proxy ? `${resolved.proxy.host}:${resolved.proxy.port}` : "không có"}`);
    }
    catch (err) {
        console.error(`❌ Không đọc được session: ${err.message}`);
        process.exit(1);
    }
    const [client, err] = await (0, clientPool_1.getTelegramClient)(cloneId);
    if (err) {
        console.error(`❌ Kết nối Telegram thất bại: ${err.message}`);
        process.exit(1);
    }
    const me = await client.getMe();
    console.log(`✅ Đăng nhập OK`);
    console.log(`   User ID : ${me.id}`);
    console.log(`   Username: @${me.username ?? "(không có)"}`);
    console.log(`   Tên     : ${me.firstName ?? ""} ${me.lastName ?? ""}`.trim());
    await (0, clientPool_1.disconnectClient)(cloneId);
    console.log(`\n✅ Clone "${cloneId}" sẵn sàng chạy seeding.\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
