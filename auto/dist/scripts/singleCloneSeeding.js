"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SINGLE_CLONE_ID = void 0;
exports.createSingleCloneScript = createSingleCloneScript;
const seeding_1 = require("../types/seeding");
const config_1 = require("../config");
/** Clone ID duy nhất — khớp tên file clones/84326098841.session */
exports.SINGLE_CLONE_ID = "84326098841";
/**
 * Kịch bản thực tế cho 1 clone:
 * gửi 1 tin → chờ → thả tim vào chính tin vừa gửi
 */
function createSingleCloneScript() {
    if (!config_1.config.defaultChatId || config_1.config.defaultChatId === "-1001234567890") {
        console.warn("⚠️  DEFAULT_CHAT_ID chưa cấu hình đúng. Chạy: npm run list:chats để lấy ID group");
    }
    return {
        id: `wf-single-${Date.now()}`,
        name: "Single clone test",
        chatId: config_1.config.defaultChatId,
        steps: [
            {
                cloneId: exports.SINGLE_CLONE_ID,
                action: "send_message",
                payload: {
                    text: "Xin chào mọi người, mình mới vào group 👋",
                },
                delayBefore: (0, seeding_1.randomDelay)(3, 8),
            },
            {
                cloneId: exports.SINGLE_CLONE_ID,
                action: "react",
                payload: {
                    reaction: "👍",
                },
                delayBefore: (0, seeding_1.randomDelay)(10, 20),
            },
        ],
    };
}
