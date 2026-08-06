import { SeedingScript, randomDelay } from "../types/seeding";
import { config } from "../config";

/** Clone ID duy nhất — khớp tên file clones/84326098841.session */
export const SINGLE_CLONE_ID = "84326098841";

/**
 * Kịch bản thực tế cho 1 clone:
 * gửi 1 tin → chờ → thả tim vào chính tin vừa gửi
 */
export function createSingleCloneScript(): SeedingScript {
  if (!config.defaultChatId || config.defaultChatId === "-1001234567890") {
    console.warn(
      "⚠️  DEFAULT_CHAT_ID chưa cấu hình đúng. Chạy: npm run list:chats để lấy ID group"
    );
  }

  return {
    id: `wf-single-${Date.now()}`,
    name: "Single clone test",
    chatId: config.defaultChatId,
    steps: [
      {
        cloneId: SINGLE_CLONE_ID,
        action: "send_message",
        payload: {
          text: "Xin chào mọi người, mình mới vào group 👋",
        },
        delayBefore: randomDelay(3, 8),
      },
      {
        cloneId: SINGLE_CLONE_ID,
        action: "react",
        payload: {
          reaction: "👍",
        },
        delayBefore: randomDelay(10, 20),
      },
    ],
  };
}
