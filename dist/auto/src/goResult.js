"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
exports.failErr = failErr;
exports.tryAsync = tryAsync;
exports.isFloodWait = isFloodWait;
exports.parseFloodWaitSeconds = parseFloodWaitSeconds;
function ok(value) {
    return [value, null];
}
function fail(message) {
    return [null, new Error(message)];
}
function failErr(err) {
    return [null, err];
}
async function tryAsync(fn) {
    try {
        const value = await fn();
        return ok(value);
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return failErr(error);
    }
}
function isFloodWait(err) {
    return err.message.includes("FLOOD_WAIT");
}
function parseFloodWaitSeconds(err) {
    const match = err.message.match(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}
