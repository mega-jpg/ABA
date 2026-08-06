import { Redis } from "ioredis";
export declare function getBcrChannel(): string;
export declare function startBcrSubscriber(): Promise<Redis>;
export declare function closeBcrSubscriber(): Promise<void>;
/** Publish test event (dùng cho debug) */
export declare function publishBcrTestEvent(event: string, groupId?: string): Promise<void>;
