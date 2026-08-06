/**
 * Xem trước kịch bản sẽ chạy từ seeding.config.json
 * Usage: npm run config:preview
 */
import { loadSeedingConfig } from "../services/seedingConfig";
import { buildScriptFromConfig } from "../services/scriptBuilder";

async function main(): Promise<void> {
  const cfg = await loadSeedingConfig();
  const script = await buildScriptFromConfig(cfg);

  console.log("\n=== Preview seeding.config.json ===\n");
  console.log(`Mode     : ${cfg.mode}`);
  console.log(`Group    : ${script.chatId}`);
  console.log(`Workflow : ${script.name}`);
  console.log(`Clones   : ${cfg.clones.filter((c) => c.enabled).map((c) => c.id).join(", ")}`);
  console.log(`\nSteps (${script.steps.length}):\n`);

  for (const [i, step] of script.steps.entries()) {
    const detail =
      step.action === "send_message"
        ? `"${step.payload.text}"`
        : step.action === "send_gif"
          ? step.payload.gifUrl ?? ""
          : step.action === "react"
            ? step.payload.reaction
            : step.payload.inviteLink ?? "";

    console.log(
      `  ${i + 1}. [${step.cloneId}] ${step.action} ${detail} — chờ ${step.delayBefore}s`
    );
  }

  console.log("\nChạy thực tế: npm run run:once\n");
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
