import { BcrEventType } from "../types/customScenario";
export declare function normalizeBcrEvent(raw: string): BcrEventType | null;
export declare function parseBcrPubSubMessage(raw: string): {
    eventType: BcrEventType;
    groupId?: string;
    roundId?: string;
} | null;
