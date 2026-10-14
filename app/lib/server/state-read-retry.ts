import 'server-only';

const RETRY_DELAYS_MS = [120, 280] as const;

/** Only transport failures from D1 are retryable; application/HTTP errors keep their meaning. */
export function isTransientStateReadError(error: unknown): boolean {
 const messages: string[] = [];
 const visited = new Set<object>();
 let current = error;
 for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
  if (visited.has(current)) break;
  visited.add(current);
  const detail = current as { message?: unknown; name?: unknown; cause?: unknown; status?: unknown };
  if (typeof detail.status === 'number' && detail.status >= 400 && detail.status <= 599) return false;
  if (typeof detail.name === 'string') messages.push(detail.name);
  if (typeof detail.message === 'string') messages.push(detail.message);
  current = detail.cause;
 }
 const description = messages.join(' ');
 return /\bD1_ERROR\b|\bD1Error\b/i.test(description)
  && /\bnetwork connection (?:lost|reset|closed)\b|\bconnection reset by peer\b|\bconnection (?:lost|closed) unexpectedly\b/i.test(description);
}

/** Restart the entire GET read so a committed CAS update is reloaded, never replayed from stale state. */
export async function retryStateRead<T>(
 read: () => Promise<T>,
 wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<T> {
 for (let attempt = 0; ; attempt++) {
  try { return await read(); }
  catch (error) {
   if (attempt >= RETRY_DELAYS_MS.length || !isTransientStateReadError(error)) throw error;
   await wait(RETRY_DELAYS_MS[attempt]);
  }
 }
}
