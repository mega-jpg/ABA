/**
 * Convert Telethon .session (SQLite) → GramJS StringSession
 * Usage: npm run convert:telethon clones/sessions/84326098841.session
 */
import fs from "fs/promises";
import path from "path";
import {
  isTelethonSqlite,
  readTelethonRow,
  telethonRowToGramJsString,
} from "../telegram/sessionConvert";

async function main(): Promise<void> {
  const inputPath = path.resolve(process.argv[2] ?? "");
  if (!inputPath) {
    console.log("Usage: npm run convert:telethon <path/to/file.session>");
    process.exit(1);
  }

  const baseName = path.basename(inputPath, ".session");
  const outputPath = path.join(path.dirname(inputPath), `${baseName}.session`);
  const backupPath = path.join(path.dirname(inputPath), `${baseName}.telethon.bak`);

  const buf = await fs.readFile(inputPath);
  if (!isTelethonSqlite(buf)) {
    console.error("❌ File không phải Telethon SQLite session");
    process.exit(1);
  }

  const row = readTelethonRow(inputPath);
  const gramJsSession = telethonRowToGramJsString(row);

  await fs.copyFile(inputPath, backupPath);
  await fs.writeFile(outputPath, gramJsSession);

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
