import { BcrEventType } from "../types/customScenario";
export declare function handleBcrPubSubMessage(raw: string): Promise<{
    ok: boolean;
    message: string;
    workflowId?: string;
}>;
export declare function runBcrScenarioById(scenarioId: string, groupIdOverride?: string): Promise<string>;
export type { BcrEventType };
