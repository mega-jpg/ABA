/**
 * Kiểm tra 1 clone có kết nối được bằng session không
 * Usage: npm run test:session clone_a
 */
import dotenv from "dotenv";
import { getTelegramClient, disconnectClient } from "../telegram/clientPool";
import { resolveCloneSession } from "../telegram/sessionLoader";
import { config } from "../config";
import path from "path";

dotenv.config();

async function main(): Promise<void> {
  const cloneId = process.argv[2];
  if (!cloneId) {
    console.log("Usage: npm run test:session <clone_id>");
    console.log("Ví dụ: npm run test:session clone_a");
    process.exit(1);
  }

  console.log(`\n=== Test session: ${cloneId} ===\n`);

  try {
    const resolved = await resolveCloneSession(cloneId, config.clonesDir);
    console.log(`✅ Đọc session OK (nguồn: ${resolved.source})`);
    console.log(`   Độ dài: ${resolved.session.length} ký tự`);
    console.log(`   Proxy: ${resolved.proxy ? `${resolved.proxy.host}:${resolved.proxy.port}` : "không có"}`);
  } catch (err) {
    console.error(`❌ Không đọc được session: ${(err as Error).message}`);
    process.exit(1);
  }

  const [client, err] = await getTelegramClient(cloneId);
  if (err) {
    console.error(`❌ Kết nối Telegram thất bại: ${err.message}`);
    process.exit(1);
  }

  const me = await client.getMe();
  console.log(`✅ Đăng nhập OK`);
  console.log(`   User ID : ${me.id}`);
  console.log(`   Username: @${me.username ?? "(không có)"}`);
  console.log(`   Tên     : ${me.firstName ?? ""} ${me.lastName ?? ""}`.trim());

  await disconnectClient(cloneId);
  console.log(`\n✅ Clone "${cloneId}" sẵn sàng chạy seeding.\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
