/**
 * Đăng nhập 1 clone và lưu session string vào clones/{id}.session
 * Usage: npm run login clone_a
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import fs from "fs/promises";
import path from "path";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
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

  const clonesDir = path.resolve(process.env.CLONES_DIR ?? "./clones");
  await fs.mkdir(clonesDir, { recursive: true });

  const sessionPath = path.join(clonesDir, `${cloneId}.session`);
  let existingSession = "";
  try {
    existingSession = (await fs.readFile(sessionPath, "utf-8")).trim();
  } catch {
    // chưa có session
  }

  console.log(`\n🔐 Đăng nhập clone: ${cloneId}`);
  console.log(`   Session sẽ lưu tại: ${sessionPath}\n`);

  const client = new TelegramClient(
    new StringSession(existingSession),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.start({
    phoneNumber: async () => await ask("Số điện thoại (+84...): "),
    password: async () => await ask("Mật khẩu 2FA (Enter nếu không có): "),
    phoneCode: async () => await ask("Mã OTP Telegram gửi: "),
    onError: (err) => console.error(err),
  });

  const sessionStr = (client.session as StringSession).save();
  await fs.writeFile(sessionPath, sessionStr);

  const me = await client.getMe();
  console.log(`\n✅ Đăng nhập thành công: @${me.username ?? me.id}`);
  console.log(`   Session đã lưu: ${sessionPath}`);

  await client.disconnect();
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
