import { CustomScenario, CreateScenarioInput } from "../../types/customScenario";
import { SeedingScript } from "../../types/seeding";
export declare function listScenarios(filter?: {
    source?: string;
    eventType?: string;
}): Promise<CustomScenario[]>;
export declare function readAllScenarios(): Promise<CustomScenario[]>;
export declare function writeAllScenarios(scenarios: CustomScenario[]): Promise<void>;
export declare function countScenariosByEvent(): Promise<Record<string, number>>;
export declare function getScenario(id: string): Promise<CustomScenario | null>;
export declare function createScenario(input: CreateScenarioInput): Promise<CustomScenario>;
export declare function updateScenario(id: string, patch: Partial<CreateScenarioInput> & {
    enabled?: boolean;
}): Promise<CustomScenario | null>;
export declare function deleteScenario(id: string): Promise<boolean>;
export declare function markScenarioRun(id: string, workflowId: string): Promise<void>;
export declare function toSeedingScript(scenario: CustomScenario): SeedingScript;
export declare function computeJobDelays(scenario: CustomScenario): number[];
