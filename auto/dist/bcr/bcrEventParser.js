"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBcrEvent = normalizeBcrEvent;
exports.parseBcrPubSubMessage = parseBcrPubSubMessage;
const ALIASES = {
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
function normalizeBcrEvent(raw) {
    const key = raw.trim().toLowerCase().normalize("NFC");
    return ALIASES[key] ?? null;
}
function parseBcrPubSubMessage(raw) {
    try {
        const data = JSON.parse(raw);
        const eventRaw = data.event ??
            data.result ??
            data.type ??
            data.status;
        if (!eventRaw)
            return null;
        const eventType = normalizeBcrEvent(String(eventRaw));
        if (!eventType)
            return null;
        return {
            eventType,
            groupId: data.groupId ? String(data.groupId) : undefined,
            roundId: data.roundId ? String(data.roundId) : undefined,
        };
    }
    catch {
        const eventType = normalizeBcrEvent(raw);
        return eventType ? { eventType } : null;
    }
}
