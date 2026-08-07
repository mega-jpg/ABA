"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExampleScript = createExampleScript;
exports.createCustomScript = createCustomScript;
const seeding_1 = require("../types/seeding");
const config_1 = require("../config");
function createExampleScript() {
    return {
        id: `wf-${Date.now()}`,
        name: "Demo sản phẩm seeding",
        chatId: config_1.config.defaultChatId,
        steps: [
            {
                cloneId: "clone_a",
                action: "send_message",
                payload: {
                    text: "Sản phẩm này có tốt không mọi người? 🤔",
                },
                delayBefore: (0, seeding_1.randomDelay)(5, 10),
            },
            {
                cloneId: "clone_b",
                action: "send_message",
                payload: {
                    text: "Mình dùng 2 tháng rồi, ổn áp lắm nha 👍",
                },
                delayBefore: (0, seeding_1.randomDelay)(15, 25),
            },
            {
                cloneId: "clone_c",
                action: "react",
                payload: {
                    reaction: "❤️",
                },
                delayBefore: (0, seeding_1.randomDelay)(5, 15),
            },
        ],
    };
}
function createCustomScript(chatId, conversations) {
    const steps = [];
    let prevCloneId = null;
    for (const conv of conversations) {
        for (const text of conv.messages) {
            steps.push({
                cloneId: conv.cloneId,
                action: "send_message",
                payload: { text },
                delayBefore: (0, seeding_1.randomDelay)(15, 45),
            });
            prevCloneId = conv.cloneId;
        }
        if (conv.reactions) {
            for (const reaction of conv.reactions) {
                steps.push({
                    cloneId: conv.cloneId === prevCloneId ? "clone_c" : conv.cloneId,
                    action: "react",
                    payload: { reaction },
                    delayBefore: (0, seeding_1.randomDelay)(5, 20),
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
