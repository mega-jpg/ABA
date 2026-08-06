import { SeedingScript, randomDelay } from "../types/seeding";
import { config } from "../config";

/**
 * Kịch bản mẫu: 3 clone tương tác tự nhiên trong group
 *
 * Clone A hỏi → (15-25s) Clone B reply → (5-15s) Clone C thả tim
 */
export function createExampleScript(): SeedingScript {
  return {
    id: `wf-${Date.now()}`,
    name: "Demo sản phẩm seeding",
    chatId: config.defaultChatId,
    steps: [
      {
        cloneId: "clone_a",
        action: "send_message",
        payload: {
          text: "Sản phẩm này có tốt không mọi người? 🤔",
        },
        delayBefore: randomDelay(5, 10),
      },
      {
        cloneId: "clone_b",
        action: "send_message",
        payload: {
          text: "Mình dùng 2 tháng rồi, ổn áp lắm nha 👍",
          // replyToMsgId sẽ tự lấy từ workflow state (tin nhắn của clone_a)
        },
        delayBefore: randomDelay(15, 25),
      },
      {
        cloneId: "clone_c",
        action: "react",
        payload: {
          reaction: "❤️",
        },
        delayBefore: randomDelay(5, 15),
      },
    ],
  };
}

/**
 * Tạo kịch bản tùy chỉnh với nhiều clone hơn
 */
export function createCustomScript(
  chatId: string,
  conversations: Array<{
    cloneId: string;
    messages: string[];
    reactions?: string[];
  }>
): SeedingScript {
  const steps: SeedingScript["steps"] = [];
  let prevCloneId: string | null = null;

  for (const conv of conversations) {
    for (const text of conv.messages) {
      steps.push({
        cloneId: conv.cloneId,
        action: "send_message",
        payload: { text },
        delayBefore: randomDelay(15, 45),
      });
      prevCloneId = conv.cloneId;
    }

    if (conv.reactions) {
      for (const reaction of conv.reactions) {
        steps.push({
          cloneId: conv.cloneId === prevCloneId ? "clone_c" : conv.cloneId,
          action: "react",
          payload: { reaction },
          delayBefore: randomDelay(5, 20),
        });
      }
    }
  }

  return {
    id: `wf-${Date.now()}`,
    name: "Custom seeding script",
    chatId,
    steps,
  };
}
