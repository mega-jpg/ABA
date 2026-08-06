import { BcrEventType, CustomScenario } from "../types/customScenario";
/**
 * Chọn kịch bản BCR tiếp theo — không lặp cho đến khi hết deck rồi xáo lại.
 * win / draw / lose / qa dùng deck; không lặp đến khi hết rồi xáo lại.
 */
export declare function pickNextBcrScenario(eventType: BcrEventType): Promise<CustomScenario | null>;
/** Reset deck (test / sau khi seed lại kịch bản) */
export declare function resetBcrScenarioDecks(): void;
/** Số kịch bản còn lại trong deck */
export declare function getBcrDeckRemaining(eventType: BcrEventType): number;
