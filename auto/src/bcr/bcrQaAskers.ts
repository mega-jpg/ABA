import fs from "fs/promises";
import path from "path";
import { listClones } from "../admin/services/resourceService";
import { BcrQaPair } from "./bcrQaMessages";

export interface QaAskerConfig {
  askerIds: string[];
  maxQuestionsPerAsker: number;
}

export interface QaAssignment {
  pair: BcrQaPair;
  askerId: string;
  answererId: string;
}

const CONFIG_PATH = path.resolve(
  process.env.SEEDING_CONFIG ?? "./seeding.config.json"
);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Danh sách clone được phép hỏi — từ seeding.config.json hoặc BCR_QA_ASKERS */
export async function loadQaAskerConfig(): Promise<QaAskerConfig> {
  const alive = new Set((await listClones()).map((c) => c.id));
  let askerIds: string[] = [];
  let maxQuestionsPerAsker = 2;

  try {
    const cfg = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8")) as {
      qaAskers?: { cloneIds?: string[]; maxQuestionsPerAsker?: number };
    };
    if (cfg.qaAskers?.cloneIds?.length) {
      askerIds = cfg.qaAskers.cloneIds;
      maxQuestionsPerAsker = cfg.qaAskers.maxQuestionsPerAsker ?? 2;
    }
  } catch {
    /* dùng env / fallback */
  }

  if (askerIds.length === 0 && process.env.BCR_QA_ASKERS) {
    askerIds = process.env.BCR_QA_ASKERS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (askerIds.length === 0) {
    askerIds = [...alive].slice(0, 8);
  }

  askerIds = askerIds.filter((id) => alive.has(id));
  if (askerIds.length === 0) {
    throw new Error(
      "Không có qaAskers hợp lệ — thêm qaAskers.cloneIds vào seeding.config.json"
    );
  }

  maxQuestionsPerAsker = Math.min(2, Math.max(1, maxQuestionsPerAsker));

  return { askerIds, maxQuestionsPerAsker };
}

/**
 * Gán cặp hỏi–đáp cho người hỏi cố định.
 * Mỗi người hỏi tối đa maxPerAsker câu, không trùng chủ đề (group/hall).
 */
export function assignQaPairs(
  askerIds: string[],
  answererIds: string[],
  pairs: BcrQaPair[],
  maxPerAsker: number
): QaAssignment[] {
  const state = new Map<string, { count: number; topics: Set<string> }>();
  for (const id of askerIds) {
    state.set(id, { count: 0, topics: new Set() });
  }

  const assignments: QaAssignment[] = [];
  const responders = answererIds.length > 0 ? answererIds : askerIds;

  for (const pair of shuffle(pairs)) {
    const eligible = shuffle(askerIds).filter((id) => {
      const s = state.get(id)!;
      return s.count < maxPerAsker && !s.topics.has(pair.topic);
    });
    if (eligible.length === 0) continue;

    const askerId = eligible[0];
    const st = state.get(askerId)!;
    st.count++;
    st.topics.add(pair.topic);

    const answerPool = responders.filter((id) => id !== askerId);
    const answererId =
      answerPool.length > 0
        ? answerPool[assignments.length % answerPool.length]
        : askerId;

    assignments.push({ pair, askerId, answererId });
  }

  return assignments;
}

export function summarizeQaAssignments(
  assignments: QaAssignment[]
): Map<string, { count: number; topics: string[] }> {
  const summary = new Map<string, { count: number; topics: string[] }>();
  for (const a of assignments) {
    const cur = summary.get(a.askerId) ?? { count: 0, topics: [] };
    cur.count++;
    if (!cur.topics.includes(a.pair.topic)) cur.topics.push(a.pair.topic);
    summary.set(a.askerId, cur);
  }
  return summary;
}
