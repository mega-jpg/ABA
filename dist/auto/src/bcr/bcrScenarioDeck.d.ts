import { BcrEventType, CustomScenario } from "../types/customScenario";
export declare function pickNextBcrScenario(eventType: BcrEventType): Promise<CustomScenario | null>;
export declare function resetBcrScenarioDecks(): void;
export declare function getBcrDeckRemaining(eventType: BcrEventType): number;
