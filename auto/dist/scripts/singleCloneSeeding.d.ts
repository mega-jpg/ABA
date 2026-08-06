import { SeedingScript } from "../types/seeding";
/** Clone ID duy nhất — khớp tên file clones/84326098841.session */
export declare const SINGLE_CLONE_ID = "84326098841";
/**
 * Kịch bản thực tế cho 1 clone:
 * gửi 1 tin → chờ → thả tim vào chính tin vừa gửi
 */
export declare function createSingleCloneScript(): SeedingScript;
