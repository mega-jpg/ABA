import {
  listScenarios,
  createScenario,
  readAllScenarios,
  writeAllScenarios,
} from "../admin/services/scenarioStore";
import { listClones } from "../admin/services/resourceService";
import { getBcrFollowUp, BCR_EVENT_LABELS, pickUniqueBcrMessages } from "./bcrMessages";
import { resetBcrScenarioDecks } from "./bcrScenarioDeck";
import { getBcrQaPairs, QA_PAIRS } from "./bcrQaMessages";
import {
  loadQaAskerConfig,
  assignQaPairs,
  summarizeQaAssignments,
  QaAssignment,
} from "./bcrQaAskers";
import { BcrEventType, CreateScenarioInput } from "../types/customScenario";
import fs from "fs/promises";
import path from "path";

const EVENT_TYPES: BcrEventType[] = ["win", "draw", "lose"];
const PER_TYPE = 100;

async function getDefaultGroupId(): Promise<string> {
  try {
    const cfg = JSON.parse(
      await fs.readFile(
        path.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json"),
        "utf-8"
      )
    ) as { target?: { groupId?: string } };
    return cfg.target?.groupId ?? process.env.DEFAULT_CHAT_ID ?? "-5290958067";
  } catch {
    return process.env.DEFAULT_CHAT_ID ?? "-5290958067";
  }
}

function buildScenarioInput(
  eventType: BcrEventType,
  index: number,
  texts: string[],
  groupId: string,
  cloneIds: string[]
): CreateScenarioInput {
  const label = BCR_EVENT_LABELS[eventType];
  const num = String(index + 1).padStart(3, "0");

  const steps: CreateScenarioInput["steps"] = texts.map((text, i) => ({
    cloneId: cloneIds[(index + i) % cloneIds.length],
    action: "send_message",
    text,
    delayBeforeSec: i === 0 ? 3 + (index % 5) : 6 + i * 2 + (index % 7),
  }));

  if (eventType === "win" && index % 3 === 0 && steps.length > 1) {
    steps.push({
      cloneId: cloneIds[(index + 1) % cloneIds.length],
      action: "react",
      reaction: ["🔥", "👍", "💰", "🎉"][index % 4],
      delayBeforeSec: 8 + (index % 12),
    });
  }

  if ((eventType === "draw" || eventType === "lose") && index % 4 === 0) {
    steps.push({
      cloneId: cloneIds[(index + 2) % cloneIds.length],
      action: "send_message",
      text: getBcrFollowUp(eventType, index),
      delayBeforeSec: 12 + (index % 15),
    });
  }

  return {
    name: `BCR ${label} #${num}`,
    groupId,
    source: "bcr",
    eventType,
    steps,
  };
}

function buildQaScenarioInput(
  index: number,
  assignment: QaAssignment,
  groupId: string
): CreateScenarioInput {
  const { pair, askerId, answererId } = assignment;
  const num = String(index + 1).padStart(3, "0");
  const topicLabel = pair.topic === "group" ? "Nhóm" : "Sảnh";

  return {
    name: `BCR Hỏi đáp ${topicLabel} #${num}`,
    groupId,
    source: "bcr",
    eventType: "qa",
    steps: [
      {
        cloneId: askerId,
        action: "send_message",
        text: pair.question,
        delayBeforeSec: 4 + (index % 10),
      },
      {
        cloneId: answererId,
        action: "send_message",
        text: pair.answer,
        delayBeforeSec: 18 + (index % 25),
      },
    ],
  };
}

async function seedQaScenarios(
  groupId: string,
  allCloneIds: string[]
): Promise<number> {
  const { askerIds, maxQuestionsPerAsker } = await loadQaAskerConfig();
  const pairs = getBcrQaPairs(QA_PAIRS.length);
  const assignments = assignQaPairs(
    askerIds,
    allCloneIds,
    pairs,
    maxQuestionsPerAsker
  );

  if (assignments.length === 0) {
    throw new Error("Không gán được kịch bản Hỏi đáp — kiểm tra qaAskers");
  }

  for (let i = 0; i < assignments.length; i++) {
    await createScenario(buildQaScenarioInput(i, assignments[i], groupId));
  }

  const summary = summarizeQaAssignments(assignments);
  console.log(
    `[BCR QA] ${assignments.length} kịch bản · ${askerIds.length} người hỏi (tối đa ${maxQuestionsPerAsker} câu/người, không trùng chủ đề)`
  );
  for (const [id, info] of summary) {
    console.log(`   → ${id}: ${info.count} câu [${info.topics.join(", ")}]`);
  }

  return assignments.length;
}

export async function seedBcrTemplates(options?: {
  force?: boolean;
  perType?: number;
}): Promise<{ created: number; skipped: boolean }> {
  const perType = options?.perType ?? PER_TYPE;
  const existing = await listScenarios();
  const hasBcr = existing.some((s) => s.source === "bcr");

  if (hasBcr && !options?.force) {
    return { created: 0, skipped: true };
  }

  if (options?.force) {
    const manual = existing.filter((s) => s.source !== "bcr");
    await writeAllScenarios(manual);
  }

  const clones = await listClones();
  const cloneIds = clones.map((c) => c.id);
  if (cloneIds.length === 0) {
    throw new Error("Không có clone — chạy filter:sessions trước");
  }

  const groupId = await getDefaultGroupId();
  let created = 0;

  for (const eventType of EVENT_TYPES) {
    const usedAcrossScenarios = new Set<string>();
    for (let i = 0; i < perType; i++) {
      const stepCount = 5 + (i % 6);
      const texts = pickUniqueBcrMessages(eventType, stepCount, usedAcrossScenarios);
      for (const t of texts) usedAcrossScenarios.add(t);
      await createScenario(
        buildScenarioInput(eventType, i, texts, groupId, cloneIds)
      );
      created++;
    }
  }

  const qaCreated = await seedQaScenarios(groupId, cloneIds);
  created += qaCreated;

  resetBcrScenarioDecks();
  return { created, skipped: false };
}

/** Seed chỉ kịch bản Hỏi đáp — không xóa win/draw/lose */
export async function seedBcrQaTemplates(options?: {
  force?: boolean;
}): Promise<{ created: number; skipped: boolean }> {
  const existing = await listScenarios();
  const qaExisting = existing.filter((s) => s.source === "bcr" && s.eventType === "qa");

  if (qaExisting.length > 0 && !options?.force) {
    return { created: 0, skipped: true };
  }

  if (options?.force) {
    const rest = existing.filter((s) => !(s.source === "bcr" && s.eventType === "qa"));
    await writeAllScenarios(rest);
  }

  const clones = await listClones();
  const cloneIds = clones.map((c) => c.id);
  if (cloneIds.length === 0) {
    throw new Error("Không có clone — chạy filter:sessions trước");
  }

  const groupId = await getDefaultGroupId();
  const created = await seedQaScenarios(groupId, cloneIds);
  resetBcrScenarioDecks();

  return { created, skipped: false };
}
