import { BcrEventType } from "../types/customScenario";
export declare function shouldRunBcrEvent(eventType: BcrEventType, groupId?: string): Promise<{
    allow: boolean;
    reason?: string;
    runsToday: number;
    maxPerDay: number;
}>;
