import { BcrQaPair } from "./bcrQaMessages";
export interface QaAskerConfig {
    askerIds: string[];
    maxQuestionsPerAsker: number;
}
export interface QaAssignment {
    pair: BcrQaPair;
    askerId: string;
    answererId: string;
}
export declare function loadQaAskerConfig(): Promise<QaAskerConfig>;
export declare function assignQaPairs(askerIds: string[], answererIds: string[], pairs: BcrQaPair[], maxPerAsker: number): QaAssignment[];
export declare function summarizeQaAssignments(assignments: QaAssignment[]): Map<string, {
    count: number;
    topics: string[];
}>;
