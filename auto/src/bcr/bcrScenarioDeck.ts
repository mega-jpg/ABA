import { listScenarios, getScenario } from "../admin/services/scenarioStore";
import { BcrEventType, CustomScenario } from "../types/customScenario";
import { BCR_EVENT_LABELS } from "./bcrMessages";

const DECK_TYPES: BcrEventType[] = ["win", "draw", "lose", "qa"];

/** ID kịch bản còn lại trong deck — mỗi eventType một deck riêng */
const remaining = new Map<BcrEventType, string[]>();

/** Chuỗi pick tuần tự theo eventType (tránh race khi nhiều event đồng thời) */
const pickChains = new Map<BcrEventType, Promise<unknown>>();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function enqueuePick<T>(
  eventType: BcrEventType,
  task: () => Promise<T>
): Promise<T> {
  const prev = pickChains.get(eventType) ?? Promise.resolve();
  const next = prev.then(task, task);
  pickChains.set(
    eventType,
    next.catch(() => undefined)
  );
  return next;
}

async function refillDeck(eventType: BcrEventType): Promise<string[]> {
  const all = await listScenarios();
  const ids = all
    .filter(
      (s) =>
        s.source === "bcr" &&
        s.eventType === eventType &&
        s.enabled
    )
    .map((s) => s.id);

  const deck = shuffle(ids);
  remaining.set(eventType, deck);

  if (deck.length > 0) {
    console.log(
      `[BCR] Xáo deck ${BCR_EVENT_LABELS[eventType]}: ${deck.length} kịch bản`
    );
  }

  return deck;
}

async function pickNextUnlocked(
  eventType: BcrEventType
): Promise<CustomScenario | null> {
  if (!DECK_TYPES.includes(eventType)) {
    return pickRandomFallback(eventType);
  }

  let deck = remaining.get(eventType);
  if (!deck || deck.length === 0) {
    deck = await refillDeck(eventType);
  }
  if (deck.length === 0) return null;

  while (deck.length > 0) {
    const id = deck.pop()!;
    remaining.set(eventType, deck);

    const scenario = await getScenario(id);
    if (scenario?.enabled && scenario.source === "bcr") {
      const left = deck.length;
      console.log(
        `[BCR] Chọn "${scenario.name}" (${BCR_EVENT_LABELS[eventType]}, còn ${left} chưa chạy)`
      );
      return scenario;
    }
  }

  remaining.set(eventType, []);
  return pickNextUnlocked(eventType);
}

/** Fallback cho qa hoặc khi deck rỗng sau lọc */
async function pickRandomFallback(
  eventType: BcrEventType
): Promise<CustomScenario | null> {
  const pool = (await listScenarios()).filter(
    (s) => s.source === "bcr" && s.eventType === eventType && s.enabled
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Chọn kịch bản BCR tiếp theo — không lặp cho đến khi hết deck rồi xáo lại.
 * win / draw / lose / qa dùng deck; không lặp đến khi hết rồi xáo lại.
 */
export function pickNextBcrScenario(
  eventType: BcrEventType
): Promise<CustomScenario | null> {
  return enqueuePick(eventType, () => pickNextUnlocked(eventType));
}

/** Reset deck (test / sau khi seed lại kịch bản) */
export function resetBcrScenarioDecks(): void {
  remaining.clear();
  pickChains.clear();
}

/** Số kịch bản còn lại trong deck */
export function getBcrDeckRemaining(eventType: BcrEventType): number {
  return remaining.get(eventType)?.length ?? 0;
}
