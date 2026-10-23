/**
 * Retry timing for a request that must not be mistaken for a negative answer.
 *
 * `/api/auth/viewer` returning an error is not the same as "nobody is signed
 * in". The first is transient and worth retrying; the second is final.
 */

/** In-request retries, before the caller falls back to a background re-arm. */
export function retryDelaysMs(): number[] {
  return [250, 1000];
}

/** How long a failed snapshot waits before trying again. */
export const RETRY_CEILING_MS = 30_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
