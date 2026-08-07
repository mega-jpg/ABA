"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const scenarioStore_1 = require("../admin/services/scenarioStore");
const bcrMessages_1 = require("../bcr/bcrMessages");
const bcrQaMessages_1 = require("../bcr/bcrQaMessages");
dotenv_1.default.config();
async function main() {
    const all = await (0, scenarioStore_1.readAllScenarios)();
    const bcr = all.filter((s) => s.source === "bcr" && s.eventType);
    const pools = {
        win: (0, bcrMessages_1.getBcrMessages)("win", 100),
        draw: (0, bcrMessages_1.getBcrMessages)("draw", 100),
        lose: (0, bcrMessages_1.getBcrMessages)("lose", 100),
    };
    const qaPairs = (0, bcrQaMessages_1.getBcrQaPairs)(bcrQaMessages_1.QA_PAIRS.length);
    const counters = {
        win: 0,
        draw: 0,
        lose: 0,
        qa: 0,
    };
    let updated = 0;
    for (const scenario of bcr) {
        const type = scenario.eventType;
        const idx = counters[type]++;
        if (type === "qa") {
            const pair = qaPairs[idx % qaPairs.length];
            let msgIdx = 0;
            for (const step of scenario.steps) {
                if (step.action === "send_message") {
                    step.text = msgIdx === 0 ? pair.question : pair.answer;
                    msgIdx++;
                    updated++;
                }
            }
        }
        else {
            const messages = pools[type];
            const mainText = messages[idx % messages.length];
            let msgStep = 0;
            for (const step of scenario.steps) {
                if (step.action === "send_message") {
                    step.text =
                        msgStep === 0
                            ? mainText
                            : (0, bcrMessages_1.getBcrFollowUp)(type, idx + msgStep);
                    msgStep++;
                    updated++;
                }
            }
        }
        scenario.updatedAt = new Date().toISOString();
    }
    const manual = all.filter((s) => s.source !== "bcr");
    const bcrUpdated = all.filter((s) => s.source === "bcr");
    await (0, scenarioStore_1.writeAllScenarios)([...manual, ...bcrUpdated]);
    console.log(`\n✅ Đã refresh ${bcr.length} kịch bản BCR (${updated} tin nhắn)\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
