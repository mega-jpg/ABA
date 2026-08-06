import { SeedingScript } from "../types/seeding";
/**
 * Kịch bản mẫu: 3 clone tương tác tự nhiên trong group
 *
 * Clone A hỏi → (15-25s) Clone B reply → (5-15s) Clone C thả tim
 */
export declare function createExampleScript(): SeedingScript;
/**
 * Tạo kịch bản tùy chỉnh với nhiều clone hơn
 */
export declare function createCustomScript(chatId: string, conversations: Array<{
    cloneId: string;
    messages: string[];
    reactions?: string[];
}>): SeedingScript;
