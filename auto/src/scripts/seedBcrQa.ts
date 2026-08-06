/**
 * Seed kịch bản Hỏi đáp (nhóm + sảnh chơi)
 * Usage: npm run seed:qa
 *        npm run seed:qa -- --force
 */
import dotenv from "dotenv";
import { seedBcrQaTemplates } from "../bcr/bcrTemplateSeeder";

dotenv.config();

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  console.log("\n=== Seed kịch bản Hỏi đáp (nhóm + sảnh chơi) ===\n");

  const result = await seedBcrQaTemplates({ force });

  if (result.skipped) {
    console.log("⏭️  Đã có kịch bản Hỏi đáp — bỏ qua (dùng --force để tạo lại)");
    process.exit(0);
  }

  console.log(`✅ Đã tạo ${result.created} kịch bản Hỏi đáp`);
  console.log("   → Admin: http://localhost:3333 (tab Hỏi đáp)\n");
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
