import { ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
export declare function getRedisConnection(): Redis;
export declare function getBullMQConnection(): ConnectionOptions;
export declare function closeRedisConnection(): Promise<void>;
