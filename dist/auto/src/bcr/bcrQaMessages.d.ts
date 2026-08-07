export interface BcrQaPair {
    question: string;
    answer: string;
    topic: "group" | "hall";
}
export declare const QA_PAIRS: BcrQaPair[];
export declare const GROUP_HALL_QUESTIONS: string[];
export declare function getBcrQaPairs(count?: number): BcrQaPair[];
export declare const BCR_QA_LABEL = "H\u1ECFi \u0111\u00E1p";
