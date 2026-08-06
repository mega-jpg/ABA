import { pickNextBcrScenario } from "./bcrScenarioDeck";
import { parseBcrPubSubMessage } from "./bcrEventParser";
import {
  markScenarioRun,
  getScenario,
} from "../admin/services/scenarioStore";
import { scheduleSeedingScript } from "../queue/scheduler";
import { BcrEventType, CustomScenario } from "../types/customScenario";
import { BCR_EVENT_LABELS, pickUniqueBcrMessages } from "./bcrMessages";
import { listClones } from "../admin/services/resourceService";
import { SeedingScript, SeedingStep } from "../types/seeding";
import { shouldRunBcrEvent } from "./bcrRunLimiter";
import { pickRandomBcrForwardGif } from "./bcrForwardGifs";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Xen 1–2 bước forward GIF ngẫu nhiên (chủ yếu khi thắng). */
function injectRandomForwardGifs(
  steps: SeedingStep[],
  eventType: BcrEventType
): void {
  if (steps.length < 3) return;
  if (eventType !== "win" && Math.random() > 0.25) return;

  const maxForwards = eventType === "win" ? randomInt(1, 2) : 1;
  const candidateIdx = steps
    .map((_, i) => i)
    .filter((i) => i > 0);
  for (let i = candidateIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidateIdx[i], candidateIdx[j]] = [candidateIdx[j], candidateIdx[i]];
  }

  let injected = 0;
  for (const idx of candidateIdx) {
    if (injected >= maxForwards) break;
    const chance = eventType === "win" ? 0.45 : 0.3;
    if (Math.random() > chance) continue;

    const target = pickRandomBcrForwardGif();
    steps[idx] = {
      ...steps[idx],
      action: "forward_message",
      payload: {
        forwardFromPeer: target.fromPeer,
        forwardMessageId: target.messageId,
      },
    };
    injected++;
  }

  if (injected === 0 && eventType === "win" && steps.length >= 4) {
    const idx = randomInt(1, steps.length - 1);
    const target = pickRandomBcrForwardGif();
    steps[idx] = {
      ...steps[idx],
      action: "forward_message",
      payload: {
        forwardFromPeer: target.fromPeer,
        forwardMessageId: target.messageId,
      },
    };
  }
}

function buildRuntimeConversationScript(
  scenario: CustomScenario,
  eventType: BcrEventType,
  groupId: string,
  aliveCloneIds: string[]
): SeedingScript {
  const targetMessages = randomInt(5, 10);
  const scenarioTexts = scenario.steps
    .filter((s) => s.action === "send_message" && !!s.text?.trim())
    .map((s) => String(s.text).trim());

  const used = new Set<string>();
  let texts: string[] = [];

  for (const text of scenarioTexts) {
    if (texts.length >= targetMessages) break;
    if (used.has(text)) continue;
    used.add(text);
    texts.push(text);
  }

  if (texts.length < targetMessages) {
    const extras = pickUniqueBcrMessages(
      eventType,
      targetMessages - texts.length,
      used
    );
    for (const text of extras) {
      if (texts.length >= targetMessages) break;
      if (!used.has(text)) {
        used.add(text);
        texts.push(text);
      }
    }
  }

  if (texts.length === 0) {
    texts = pickUniqueBcrMessages(eventType, targetMessages);
  }

  const aliveSet = new Set(aliveCloneIds);
  const preferred = Array.from(
    new Set(
      scenario.steps
        .map((s) => s.cloneId)
        .filter((id) => aliveSet.has(id))
    )
  );
  const participants: string[] = [...preferred];
  for (const id of aliveCloneIds) {
    if (participants.length >= Math.min(4, aliveCloneIds.length)) break;
    if (!participants.includes(id)) participants.push(id);
  }
  if (participants.length === 0) {
    participants.push(...aliveCloneIds.slice(0, 1));
  }

  const steps: SeedingStep[] = texts.map((text, i) => {
    const cloneId = participants[i % participants.length];
    return {
      cloneId,
      action: "send_message",
      payload: {
        text,
      },
      delayBefore: i === 0 ? randomInt(2, 6) : randomInt(6, 20),
    };
  });

  injectRandomForwardGifs(steps, eventType);

  return {
    id: `wf-${scenario.id.slice(0, 8)}-${Date.now()}`,
    name: scenario.name,
    chatId: groupId,
    steps,
  };
}

export async function handleBcrPubSubMessage(
  raw: string
): Promise<{ ok: boolean; message: string; workflowId?: string }> {
  const parsed = parseBcrPubSubMessage(raw);
  if (!parsed) {
    return { ok: false, message: `Không parse được event: ${raw.slice(0, 100)}` };
  }

  const { eventType, groupId } = parsed;
  const gate = await shouldRunBcrEvent(eventType, groupId);
  if (!gate.allow) {
    return {
      ok: true,
      message: `${BCR_EVENT_LABELS[eventType]}: bỏ qua (${gate.reason})`,
    };
  }

  const clones = await listClones();
  const aliveCloneIds = clones.map((c) => c.id);
  if (aliveCloneIds.length === 0) {
    return {
      ok: false,
      message: "Không có clone sống để chạy kịch bản",
    };
  }

  const scenario = await pickNextBcrScenario(eventType);

  if (!scenario) {
    return {
      ok: false,
      message: `Không có kịch bản BCR ${BCR_EVENT_LABELS[eventType]} — chạy npm run seed:bcr`,
    };
  }

  const resolved = groupId
    ? { ...scenario, groupId }
    : scenario;
  const script = buildRuntimeConversationScript(
    resolved,
    eventType,
    resolved.groupId,
    aliveCloneIds
  );

  const workflowId = await scheduleSeedingScript(script);
  await markScenarioRun(scenario.id, workflowId);

  console.log(
    `[BCR] ${BCR_EVENT_LABELS[eventType]} → kịch bản "${scenario.name}" → workflow ${workflowId}`
  );

  return {
    ok: true,
    workflowId,
    message: `${BCR_EVENT_LABELS[eventType]}: chạy "${scenario.name}" (${script.steps.length} tin)`,
  };
}

export async function runBcrScenarioById(
  scenarioId: string,
  groupIdOverride?: string
): Promise<string> {
  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error("Kịch bản không tồn tại");

  const resolved = groupIdOverride
    ? { ...scenario, groupId: groupIdOverride }
    : scenario;

  const clones = await listClones();
  const aliveCloneIds = clones.map((c) => c.id);
  if (aliveCloneIds.length === 0) {
    throw new Error("Không có clone sống để chạy kịch bản");
  }
  const eventType = resolved.eventType ?? "qa";
  const script = buildRuntimeConversationScript(
    resolved,
    eventType,
    resolved.groupId,
    aliveCloneIds
  );
  const workflowId = await scheduleSeedingScript(script);
  await markScenarioRun(scenario.id, workflowId);
  return workflowId;
}

export type { BcrEventType };
