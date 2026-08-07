"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickNextBcrScenario = pickNextBcrScenario;
exports.resetBcrScenarioDecks = resetBcrScenarioDecks;
exports.getBcrDeckRemaining = getBcrDeckRemaining;
const scenarioStore_1 = require("../admin/services/scenarioStore");
const bcrMessages_1 = require("./bcrMessages");
const DECK_TYPES = ["win", "draw", "lose", "qa"];
const remaining = new Map();
const pickChains = new Map();
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function enqueuePick(eventType, task) {
    const prev = pickChains.get(eventType) ?? Promise.resolve();
    const next = prev.then(task, task);
    pickChains.set(eventType, next.catch(() => undefined));
    return next;
}
async function refillDeck(eventType) {
    const all = await (0, scenarioStore_1.listScenarios)();
    const ids = all
        .filter((s) => s.source === "bcr" &&
        s.eventType === eventType &&
        s.enabled)
        .map((s) => s.id);
    const deck = shuffle(ids);
    remaining.set(eventType, deck);
    if (deck.length > 0) {
        console.log(`[BCR] Xáo deck ${bcrMessages_1.BCR_EVENT_LABELS[eventType]}: ${deck.length} kịch bản`);
    }
    return deck;
}
async function pickNextUnlocked(eventType) {
    if (!DECK_TYPES.includes(eventType)) {
        return pickRandomFallback(eventType);
    }
    let deck = remaining.get(eventType);
    if (!deck || deck.length === 0) {
        deck = await refillDeck(eventType);
    }
    if (deck.length === 0)
        return null;
    while (deck.length > 0) {
        const id = deck.pop();
        remaining.set(eventType, deck);
        const scenario = await (0, scenarioStore_1.getScenario)(id);
        if (scenario?.enabled && scenario.source === "bcr") {
            const left = deck.length;
            console.log(`[BCR] Chọn "${scenario.name}" (${bcrMessages_1.BCR_EVENT_LABELS[eventType]}, còn ${left} chưa chạy)`);
            return scenario;
        }
    }
    remaining.set(eventType, []);
    return pickNextUnlocked(eventType);
}
async function pickRandomFallback(eventType) {
    const pool = (await (0, scenarioStore_1.listScenarios)()).filter((s) => s.source === "bcr" && s.eventType === eventType && s.enabled);
    if (pool.length === 0)
        return null;
    return pool[Math.floor(Math.random() * pool.length)];
}
function pickNextBcrScenario(eventType) {
    return enqueuePick(eventType, () => pickNextUnlocked(eventType));
}
function resetBcrScenarioDecks() {
    remaining.clear();
    pickChains.clear();
}
function getBcrDeckRemaining(eventType) {
    return remaining.get(eventType)?.length ?? 0;
}
