export declare function getSessionCa(soCa: number): number;
export declare function persistNextSessionCa(soCa: number, usedCa: number): void;
export declare function resetSessionCaOverrideInConfig(): void;
export declare function setSessionCaOverrideInConfig(ca: number): void;
export declare function readSessionCaOverrideFromConfigFile(): number;
export declare function resetSessionStateOnNewDay(): void;
