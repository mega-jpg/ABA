import { BcrEventType } from "../types/customScenario";
/** Chọn câu không trùng trong cùng một ca / kịch bản */
export declare function pickUniqueBcrMessages(type: BcrEventType, count: number, exclude?: Set<string>): string[];
export declare function getBcrMessages(type: BcrEventType, count?: number): string[];
export declare function getBcrFollowUp(type: "win" | "draw" | "lose", index: number): string;
export declare const BCR_EVENT_LABELS: Record<BcrEventType, string>;
