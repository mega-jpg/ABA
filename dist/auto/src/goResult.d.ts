export type GoResult<T> = [T, null] | [null, Error];
export declare function ok<T>(value: T): GoResult<T>;
export declare function fail<T = never>(message: string): GoResult<T>;
export declare function failErr<T = never>(err: Error): GoResult<T>;
export declare function tryAsync<T>(fn: () => Promise<T>): Promise<GoResult<T>>;
export declare function isFloodWait(err: Error): boolean;
export declare function parseFloodWaitSeconds(err: Error): number | null;
