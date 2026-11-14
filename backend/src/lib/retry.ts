/** Exponential backoff schedule: 1s, 2s, 4s (spec §14). */
export const BACKOFF_MS = [1000, 2000, 4000] as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RetryOptions = {
  /** Total attempts including the first one. Default 3. */
  attempts?: number;
  /** Return false to surface an error immediately instead of retrying it. */
  shouldRetry?: (err: unknown) => boolean;
  /** Called before each backoff wait, with the 1-based number of the failed attempt. */
  onRetry?: (err: unknown, failedAttempt: number) => void;
};

/** Run `attempt` up to `attempts` times, waiting 1s/2s/4s between failures. */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, shouldRetry = () => true, onRetry } = options;
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      const isLastAttempt = index === attempts - 1;
      if (isLastAttempt || !shouldRetry(err)) throw err;

      onRetry?.(err, index + 1);
      await sleep(BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 4000);
    }
  }

  throw lastError;
}
