export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM call timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([fn(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** Number of retries after the first attempt. */
  retries: number;
  baseDelayMs: number;
  isRetryable: (e: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<{ value: T; attempts: number }> {
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt + 1 };
    } catch (e) {
      if (attempt >= o.retries || !o.isRetryable(e)) {
        (e as { attempts?: number }).attempts = attempt + 1;
        throw e;
      }
      await sleep(o.baseDelayMs * 2 ** attempt);
    }
  }
}
