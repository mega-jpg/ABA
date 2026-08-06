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
/** Danh sách clone được phép hỏi — từ seeding.config.json hoặc BCR_QA_ASKERS */
export declare function loadQaAskerConfig(): Promise<QaAskerConfig>;
/**
 * Gán cặp hỏi–đáp cho người hỏi cố định.
 * Mỗi người hỏi tối đa maxPerAsker câu, không trùng chủ đề (group/hall).
 */
export declare function assignQaPairs(askerIds: string[], answererIds: string[], pairs: BcrQaPair[], maxPerAsker: number): QaAssignment[];
export declare function summarizeQaAssignments(assignments: QaAssignment[]): Map<string, {
    count: number;
    topics: string[];
}>;
