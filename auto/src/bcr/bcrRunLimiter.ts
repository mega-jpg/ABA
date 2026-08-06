import fs from "fs/promises";
import path from "path";
import { BcrEventType } from "../types/customScenario";

type GroupRunCounter = {
  runs: number;
  skips: number;
};

type DailyRunState = {
  date: string;
  // Đếm riêng theo từng nhóm để các nhóm không giành quota của nhau.
  groups: Record<string, GroupRunCounter>;
  updatedAt: string;
};

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
const FILE = path.join(DATA_DIR, "bcr-run-limit.json");

function todayKeyVN(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" })
    .slice(0, 10);
}

async function loadState(): Promise<DailyRunState> {
  const today = todayKeyVN();
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DailyRunState>;
    if (parsed.date === today && parsed.groups) {
      return {
        date: today,
        groups: parsed.groups,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    // ignore
  }
  return {
    date: today,
    groups: {},
    updatedAt: new Date().toISOString(),
  };
}

async function saveState(state: DailyRunState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2));
}

function getCounter(state: DailyRunState, key: string): GroupRunCounter {
  if (!state.groups[key]) {
    state.groups[key] = { runs: 0, skips: 0 };
  }
  return state.groups[key];
}

export async function shouldRunBcrEvent(
  eventType: BcrEventType,
  groupId?: string
): Promise<{ allow: boolean; reason?: string; runsToday: number; maxPerDay: number }> {
  const maxRaw = Number(process.env.BCR_MAX_RUNS_PER_DAY ?? 5);
  const maxPerDay = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 5;
  const probRaw = Number(process.env.BCR_RUN_PROBABILITY ?? 0.8);
  const probability =
    Number.isFinite(probRaw) && probRaw >= 0 && probRaw <= 1 ? probRaw : 0.8;

  // QA thường là test/manual, không bóp theo quota.
  if (eventType === "qa") {
    return { allow: true, runsToday: 0, maxPerDay };
  }

  // Mỗi nhóm có quota + xúc xắc riêng (key theo groupId).
  const key = groupId && groupId.trim() ? groupId.trim() : "__no_group__";
  const state = await loadState();
  const counter = getCounter(state, key);

  if (counter.runs >= maxPerDay) {
    counter.skips += 1;
    state.updatedAt = new Date().toISOString();
    await saveState(state);
    return {
      allow: false,
      reason: `đủ quota ngày nhóm ${key} (${counter.runs}/${maxPerDay})`,
      runsToday: counter.runs,
      maxPerDay,
    };
  }

  const passRandom = Math.random() < probability;
  if (!passRandom) {
    counter.skips += 1;
    state.updatedAt = new Date().toISOString();
    await saveState(state);
    return {
      allow: false,
      reason: `random skip (p=${probability})`,
      runsToday: counter.runs,
      maxPerDay,
    };
  }

  counter.runs += 1;
  state.updatedAt = new Date().toISOString();
  await saveState(state);
  return { allow: true, runsToday: counter.runs, maxPerDay };
}
