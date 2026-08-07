import { Job, Worker } from "bullmq";
import { SeedingJobData, ActivityResult } from "../types/seeding";
export declare function teleActivityProcessor(job: Job<SeedingJobData>): Promise<ActivityResult>;
export declare function createSeedingWorker(): Worker<SeedingJobData, ActivityResult>;
