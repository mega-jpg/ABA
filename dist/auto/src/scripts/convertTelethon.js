"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sessionConvert_1 = require("../telegram/sessionConvert");
async function main() {
    const inputPath = path_1.default.resolve(process.argv[2] ?? "");
    if (!inputPath) {
        console.log("Usage: npm run convert:telethon <path/to/file.session>");
        process.exit(1);
    }
    const baseName = path_1.default.basename(inputPath, ".session");
    const outputPath = path_1.default.join(path_1.default.dirname(inputPath), `${baseName}.session`);
    const backupPath = path_1.default.join(path_1.default.dirname(inputPath), `${baseName}.telethon.bak`);
    const buf = await promises_1.default.readFile(inputPath);
    if (!(0, sessionConvert_1.isTelethonSqlite)(buf)) {
        console.error("❌ File không phải Telethon SQLite session");
        process.exit(1);
    }
    const row = (0, sessionConvert_1.readTelethonRow)(inputPath);
    const gramJsSession = (0, sessionConvert_1.telethonRowToGramJsString)(row);
    await promises_1.default.copyFile(inputPath, backupPath);
    await promises_1.default.writeFile(outputPath, gramJsSession);
    console.log(`\n✅ Convert thành công!`);
    console.log(`   Backup : ${backupPath}`);
    console.log(`   Output : ${outputPath}`);
    console.log(`   cloneId: "${baseName}"`);
    console.log(`\n   Chạy batch: npm run build:sessions\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
