export type SessionTelegramStep = 'bat_dau_ao' | 'len_ca_ao' | 'vao_sanh_ao' | 'bao_ban_ao' | 'cho_lenh_ao' | 'bat_dau_that' | 'len_ca_that' | 'vao_sanh_that' | 'bao_ban_that' | 'cho_lenh_that';
export declare function isSessionRetry(): boolean;
export declare function wasSessionStepDone(step: SessionTelegramStep, ca: number): boolean;
export declare function markSessionStepDone(step: SessionTelegramStep, ca: number): void;
export declare function getSessionSelectedTable(ca: number): string | null;
export declare function setSessionSelectedTable(ca: number, tableName: string): void;
export declare function clearSessionProgress(): void;
