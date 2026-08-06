/** Go-like Result type: [value, null] on success, [null, error] on failure */

export type GoResult<T> = [T, null] | [null, Error];

export function ok<T>(value: T): GoResult<T> {
  return [value, null];
}

export function fail<T = never>(message: string): GoResult<T> {
  return [null, new Error(message)];
}

export function failErr<T = never>(err: Error): GoResult<T> {
  return [null, err];
}

export async function tryAsync<T>(fn: () => Promise<T>): Promise<GoResult<T>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return failErr(error);
  }
}

export function isFloodWait(err: Error): boolean {
  return err.message.includes("FLOOD_WAIT");
}

export function parseFloodWaitSeconds(err: Error): number | null {
  const match = err.message.match(/FLOOD_WAIT_(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
