export interface SessionCheckResult {
    id: string;
    alive: boolean;
    reason?: string;
    userId?: string;
    username?: string;
    firstName?: string;
}
export declare function isDeadSessionError(err: Error): boolean;
export declare function validateSessionString(id: string, sessionStr: string): Promise<SessionCheckResult>;
export declare function sleep(ms: number): Promise<void>;
export declare function validateSessionsBatch(items: Array<{
    id: string;
    session: string;
}>, options?: {
    concurrency?: number;
    delayMs?: number;
}): Promise<SessionCheckResult[]>;
