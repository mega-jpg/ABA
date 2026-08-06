/**
 * Tạo sẵn 100 kịch bản mỗi loại: win / draw / lose
 * Usage: npm run seed:bcr
 *        npm run seed:bcr -- --force
 */
import dotenv from "dotenv";
import { seedBcrTemplates } from "../bcr/bcrTemplateSeeder";

dotenv.config();

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  console.log("\n=== Seed kịch bản BCR (100 khen + 100 hòa + 100 thắc mắc + 70 hỏi đáp) ===\n");

  const result = await seedBcrTemplates({ force });

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
