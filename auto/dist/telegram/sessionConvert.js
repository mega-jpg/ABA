"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telethonRowToGramJsString = telethonRowToGramJsString;
exports.isTelethonSqlite = isTelethonSqlite;
exports.isGramJsStringSession = isGramJsStringSession;
exports.readTelethonRow = readTelethonRow;
exports.parseSessionFile = parseSessionFile;
exports.scanSessionFiles = scanSessionFiles;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const SQLITE_MAGIC = "SQLite format 3";
function telethonRowToGramJsString(row) {
    const dcBuffer = Buffer.from([row.dc_id]);
    const addressBuffer = Buffer.from(row.server_address);
    const addressLengthBuffer = Buffer.alloc(2);
    addressLengthBuffer.writeInt16BE(addressBuffer.length, 0);
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeInt16BE(row.port, 0);
    const payload = Buffer.concat([
        dcBuffer,
        addressLengthBuffer,
        addressBuffer,
        portBuffer,
        row.auth_key,
    ]);
    return "1" + payload.toString("base64");
}
function isTelethonSqlite(buf) {
    return buf.subarray(0, 16).toString("utf-8").startsWith(SQLITE_MAGIC);
}
function isGramJsStringSession(content) {
    const trimmed = content.trim();
    return trimmed.startsWith("1") && trimmed.length > 50;
}
function readTelethonRow(filePath) {
    const db = new better_sqlite3_1.default(filePath, { readonly: true });
    try {
        const table = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
            .get();
        if (!table) {
            throw new Error("Không phải Telethon session (thiếu bảng sessions)");
        }
        const row = db
            .prepare("SELECT dc_id, server_address, port, auth_key FROM sessions LIMIT 1")
            .get();
        if (!row?.auth_key) {
            throw new Error("Không đọc được auth_key");
        }
        return row;
    }
    finally {
        db.close();
    }
}
/** Đọc 1 file .session → GramJS string (Telethon hoặc GramJS text) */
async function parseSessionFile(filePath) {
    const id = path_1.default.basename(filePath, ".session");
    const buf = await promises_1.default.readFile(filePath);
    if (isTelethonSqlite(buf)) {
        const row = readTelethonRow(filePath);
        return {
            id,
            session: telethonRowToGramJsString(row),
            format: "telethon",
            dcId: row.dc_id,
            server: `${row.server_address}:${row.port}`,
            sourceFile: filePath,
        };
    }
    const content = buf.toString("utf-8").trim();
    if (!isGramJsStringSession(content)) {
        throw new Error(`Session không hợp lệ: ${filePath}`);
    }
    return {
        id,
        session: content,
        format: "gramjs",
        sourceFile: filePath,
    };
}
async function scanSessionFiles(sessionsDir, onProgress) {
    try {
        await promises_1.default.access(sessionsDir);
    }
    catch {
        return [];
    }
    const entries = await promises_1.default.readdir(sessionsDir);
    const sessionEntries = entries.filter((e) => e.endsWith(".session") && !e.startsWith("."));
    const results = [];
    const errors = [];
    for (let i = 0; i < sessionEntries.length; i++) {
        const entry = sessionEntries[i];
        const filePath = path_1.default.join(sessionsDir, entry);
        onProgress?.({ current: i + 1, total: sessionEntries.length, file: entry });
        try {
            results.push(await parseSessionFile(filePath));
        }
        catch (err) {
            errors.push(`${entry}: ${err.message}`);
        }
    }
    if (errors.length > 0) {
        console.warn("⚠️  Một số file lỗi:");
        for (const e of errors)
            console.warn(`   - ${e}`);
    }
    return results.sort((a, b) => a.id.localeCompare(b.id));
}
