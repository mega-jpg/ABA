/**
 * Cập nhật lại nội dung tin nhắn cho kịch bản BCR (giữ nguyên id/structure)
 * Usage: npm run refresh:bcr-text
 */
import dotenv from "dotenv";
import { readAllScenarios, writeAllScenarios } from "../admin/services/scenarioStore";
import { getBcrMessages, getBcrFollowUp } from "../bcr/bcrMessages";
import { getBcrQaPairs, QA_PAIRS } from "../bcr/bcrQaMessages";
import { BcrEventType } from "../types/customScenario";

dotenv.config();

async function main(): Promise<void> {
  const all = await readAllScenarios();
  const bcr = all.filter((s) => s.source === "bcr" && s.eventType);

  const pools: Record<"win" | "draw" | "lose", string[]> = {
    win: getBcrMessages("win", 100),
    draw: getBcrMessages("draw", 100),
    lose: getBcrMessages("lose", 100),
  };
  const qaPairs = getBcrQaPairs(QA_PAIRS.length);

  const counters: Record<BcrEventType, number> = {
    win: 0,
    draw: 0,
    lose: 0,
    qa: 0,
  };
  let updated = 0;

  for (const scenario of bcr) {
    const type = scenario.eventType as BcrEventType;
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
    } else {
      const messages = pools[type];
      const mainText = messages[idx % messages.length];
      let msgStep = 0;
      for (const step of scenario.steps) {
        if (step.action === "send_message") {
          step.text =
            msgStep === 0
              ? mainText
              : getBcrFollowUp(type as "win" | "draw" | "lose", idx + msgStep);
          msgStep++;
          updated++;
        }
      }
    }
    scenario.updatedAt = new Date().toISOString();
  }

  const manual = all.filter((s) => s.source !== "bcr");
  const bcrUpdated = all.filter((s) => s.source === "bcr");
  await writeAllScenarios([...manual, ...bcrUpdated]);

  console.log(`\n✅ Đã refresh ${bcr.length} kịch bản BCR (${updated} tin nhắn)\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
