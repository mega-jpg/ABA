import { SeedingScript } from "../types/seeding";
export declare function createExampleScript(): SeedingScript;
export declare function createCustomScript(chatId: string, conversations: Array<{
    cloneId: string;
    messages: string[];
    reactions?: string[];
}>): SeedingScript;
