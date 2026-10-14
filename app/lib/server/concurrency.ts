import 'server-only';
/** Only call after a revision-guarded write definitively reported zero changes. */
export const REVISION_RETRY_ATTEMPTS = 20;
export function waitForRevisionRetry(attempt: number) {
 const window = Math.min(160, 16 + Math.max(0, attempt) * 12);
 return new Promise<void>(resolve => setTimeout(resolve, 8 + Math.floor(Math.random() * window)));
}
