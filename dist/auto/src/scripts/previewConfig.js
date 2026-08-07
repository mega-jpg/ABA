"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const seedingConfig_1 = require("../services/seedingConfig");
const scriptBuilder_1 = require("../services/scriptBuilder");
async function main() {
    const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
    const script = await (0, scriptBuilder_1.buildScriptFromConfig)(cfg);
    console.log("\n=== Preview seeding.config.json ===\n");
    console.log(`Mode     : ${cfg.mode}`);
    console.log(`Group    : ${script.chatId}`);
    console.log(`Workflow : ${script.name}`);
    console.log(`Clones   : ${cfg.clones.filter((c) => c.enabled).map((c) => c.id).join(", ")}`);
    console.log(`\nSteps (${script.steps.length}):\n`);
    for (const [i, step] of script.steps.entries()) {
        const detail = step.action === "send_message"
            ? `"${step.payload.text}"`
            : step.action === "send_gif"
                ? step.payload.gifUrl ?? ""
                : step.action === "react"
                    ? step.payload.reaction
                    : step.payload.inviteLink ?? "";
        console.log(`  ${i + 1}. [${step.cloneId}] ${step.action} ${detail} — chờ ${step.delayBefore}s`);
    }
    console.log("\nChạy thực tế: npm run run:once\n");
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
