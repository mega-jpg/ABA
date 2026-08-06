export interface TelethonRow {
    dc_id: number;
    server_address: string;
    port: number;
    auth_key: Buffer;
}
export type SessionSourceFormat = "gramjs" | "telethon";
export declare function telethonRowToGramJsString(row: TelethonRow): string;
export declare function isTelethonSqlite(buf: Buffer): boolean;
export declare function isGramJsStringSession(content: string): boolean;
export declare function readTelethonRow(filePath: string): TelethonRow;
export interface ParsedSessionFile {
    id: string;
    session: string;
    format: SessionSourceFormat;
    dcId?: number;
    server?: string;
    sourceFile: string;
}
/** Đọc 1 file .session → GramJS string (Telethon hoặc GramJS text) */
export declare function parseSessionFile(filePath: string): Promise<ParsedSessionFile>;
export type ScanProgress = {
    current: number;
    total: number;
    file: string;
};
export declare function scanSessionFiles(sessionsDir: string, onProgress?: (info: ScanProgress) => void): Promise<ParsedSessionFile[]>;
