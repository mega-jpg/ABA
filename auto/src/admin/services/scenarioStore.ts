import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  CustomScenario,
  CreateScenarioInput,
  ScenarioStep,
} from "../../types/customScenario";
import { SeedingScript } from "../../types/seeding";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
const SCENARIOS_FILE = path.join(DATA_DIR, "scenarios.json");

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readAll(): Promise<CustomScenario[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(SCENARIOS_FILE, "utf-8");
    return JSON.parse(raw) as CustomScenario[];
  } catch {
    return [];
  }
}

async function writeAll(scenarios: CustomScenario[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SCENARIOS_FILE, JSON.stringify(scenarios, null, 2));
}

export async function listScenarios(filter?: {
  source?: string;
  eventType?: string;
}): Promise<CustomScenario[]> {
  let all = await readAll();
  if (filter?.source === "manual") {
    all = all.filter((s) => !s.source || s.source === "manual");
  } else if (filter?.source) {
    all = all.filter((s) => s.source === filter.source);
  }
  if (filter?.eventType) {
    all = all.filter((s) => s.eventType === filter.eventType);
  }
  return all.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function readAllScenarios(): Promise<CustomScenario[]> {
  return readAll();
}

export async function writeAllScenarios(scenarios: CustomScenario[]): Promise<void> {
  await writeAll(scenarios);
}

export async function countScenariosByEvent(): Promise<Record<string, number>> {
  const all = await readAll();
  const counts: Record<string, number> = {
    manual: 0, win: 0, draw: 0, lose: 0, qa: 0,
  };
  for (const s of all) {
    if (s.source === "bcr" && s.eventType) {
      counts[s.eventType] = (counts[s.eventType] ?? 0) + 1;
    } else {
      counts.manual++;
    }
  }
  return counts;
}

export async function getScenario(id: string): Promise<CustomScenario | null> {
  const all = await readAll();
  return all.find((s) => s.id === id) ?? null;
}

export async function createScenario(
  input: CreateScenarioInput
): Promise<CustomScenario> {
  const now = new Date().toISOString();
  const scenario: CustomScenario = {
    id: randomUUID(),
    name: input.name,
    groupId: input.groupId,
    enabled: true,
    source: input.source ?? "manual",
    eventType: input.eventType,
    scheduledAt: input.scheduledAt,
    steps: input.steps.map((s) => ({ ...s, id: randomUUID() })),
    createdAt: now,
    updatedAt: now,
  };
  const all = await readAll();
  all.push(scenario);
  await writeAll(all);
  return scenario;
}

export async function updateScenario(
  id: string,
  patch: Partial<CreateScenarioInput> & { enabled?: boolean }
): Promise<CustomScenario | null> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const current = all[idx];
  const updated: CustomScenario = {
    ...current,
    name: patch.name ?? current.name,
    groupId: patch.groupId ?? current.groupId,
    scheduledAt: patch.scheduledAt ?? current.scheduledAt,
    enabled: patch.enabled ?? current.enabled,
    source: patch.source ?? current.source,
    eventType: patch.eventType ?? current.eventType,
    steps: patch.steps
      ? patch.steps.map((s) => ({
          ...s,
          id: (s as ScenarioStep).id ?? randomUUID(),
        }))
      : current.steps,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

export async function deleteScenario(id: string): Promise<boolean> {
  const all = await readAll();
  const filtered = all.filter((s) => s.id !== id);
  if (filtered.length === all.length) return false;
  await writeAll(filtered);
  return true;
}

export async function markScenarioRun(
  id: string,
  workflowId: string
): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return;
  all[idx].lastRunAt = new Date().toISOString();
  all[idx].lastWorkflowId = workflowId;
  await writeAll(all);
}

export function toSeedingScript(scenario: CustomScenario): SeedingScript {
  return {
    id: `wf-${scenario.id.slice(0, 8)}-${Date.now()}`,
    name: scenario.name,
    chatId: scenario.groupId,
    steps: scenario.steps.map((step) => ({
      cloneId: step.cloneId,
      action: step.action,
      payload: {
        ...(step.text ? { text: step.text } : {}),
        ...(step.gifUrl ? { gifUrl: step.gifUrl } : {}),
        ...(step.reaction ? { reaction: step.reaction } : {}),
        ...(step.replyToPrevious ? { replyToPrevious: true } : {}),
        ...(step.inviteLink ? { inviteLink: step.inviteLink } : {}),
      },
      delayBefore: step.delayBeforeSec,
    })),
  };
}

export function computeJobDelays(scenario: CustomScenario): number[] {
  const now = Date.now();
  const baseStart = scenario.scheduledAt
    ? new Date(scenario.scheduledAt).getTime()
    : now;
  const workflowOffset = Math.max(0, baseStart - now);

  let cumulative = 0;
  return scenario.steps.map((step) => {
    if (step.runAt) {
      return Math.max(0, new Date(step.runAt).getTime() - now);
    }
    cumulative += step.delayBeforeSec * 1000;
    return workflowOffset + cumulative;
  });
}
