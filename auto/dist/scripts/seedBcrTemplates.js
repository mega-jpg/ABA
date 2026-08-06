"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Tạo sẵn 100 kịch bản mỗi loại: win / draw / lose
 * Usage: npm run seed:bcr
 *        npm run seed:bcr -- --force
 */
const dotenv_1 = __importDefault(require("dotenv"));
const bcrTemplateSeeder_1 = require("../bcr/bcrTemplateSeeder");
dotenv_1.default.config();
async function main() {
    const force = process.argv.includes("--force");
    console.log("\n=== Seed kịch bản BCR (100 khen + 100 hòa + 100 thắc mắc + 70 hỏi đáp) ===\n");
    const result = await (0, bcrTemplateSeeder_1.seedBcrTemplates)({ force });
    if (result.skipped) {
        console.log("⏭️  Đã có kịch bản BCR — bỏ qua (dùng --force để tạo lại)");
        process.exit(0);
    }
    console.log(`✅ Đã tạo ${result.created} kịch bản BCR`);
    console.log("   → Admin: http://localhost:3333 (tab Win/Hòa/Thua)\n");
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
