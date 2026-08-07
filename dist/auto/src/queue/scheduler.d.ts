import { Queue } from "bullmq";
import { SeedingJobData, SeedingScript } from "../types/seeding";
export declare function getSeedingQueue(): Queue<SeedingJobData>;
export declare function scheduleSeedingScript(script: SeedingScript, delaysMs?: number[]): Promise<string>;
export declare function getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
}>;
export declare function closeQueue(): Promise<void>;
