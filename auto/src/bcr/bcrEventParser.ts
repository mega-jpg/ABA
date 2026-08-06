import { BcrEventType } from "../types/customScenario";

const ALIASES: Record<string, BcrEventType> = {
  win: "win",
  thang: "win",
  thắng: "win",
  w: "win",
  victory: "win",

  draw: "draw",
  hoa: "draw",
  hòa: "draw",
  tie: "draw",
  d: "draw",

  lose: "lose",
  thua: "lose",
  l: "lose",
  loss: "lose",

  qa: "qa",
  hoidap: "qa",
  "hỏi đáp": "qa",
  question: "qa",
  q: "qa",
};

export function normalizeBcrEvent(raw: string): BcrEventType | null {
  const key = raw.trim().toLowerCase().normalize("NFC");
  return ALIASES[key] ?? null;
}

export function parseBcrPubSubMessage(raw: string): {
  eventType: BcrEventType;
  groupId?: string;
  roundId?: string;
} | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const eventRaw =
      (data.event as string) ??
      (data.result as string) ??
      (data.type as string) ??
      (data.status as string);
    if (!eventRaw) return null;

    const eventType = normalizeBcrEvent(String(eventRaw));
    if (!eventType) return null;

    return {
      eventType,
      groupId: data.groupId ? String(data.groupId) : undefined,
      roundId: data.roundId ? String(data.roundId) : undefined,
    };
  } catch {
    const eventType = normalizeBcrEvent(raw);
    return eventType ? { eventType } : null;
  }
}
