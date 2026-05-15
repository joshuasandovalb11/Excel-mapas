import { RequestTimeoutError } from '../utils/appError';

/**
 * Wrapper para fetch con timeout, reintentos y soporte para AbortSignal.
 * - Reintentos solo en errores de red o HTTP 408/429/5xx
 * - Backoff exponencial con jitter
 */
export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || (status >= 500 && status < 600);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffDelay = (
  attemptNumber: number,
  baseDelayMs: number
): number => {
  const expDelay = baseDelayMs * Math.pow(2, attemptNumber - 1);
  const jitter = Math.random() * Math.min(expDelay * 0.1, 250);
  return Math.min(expDelay + jitter, 30000);
};

export async function fetchWithTimeout(
  input: RequestInfo,
  init: FetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 15000,
    retries = 1,
    backoffMs = 150,
    signal: externalSignal,
    ...rest
  } = init;

  const attempt = async (attemptNumber: number): Promise<Response> => {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(input, {
        signal: controller.signal,
        ...rest,
      });

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attemptNumber < retries) {
          const delayMs = getBackoffDelay(attemptNumber, backoffMs);
          await sleep(delayMs);
          return attempt(attemptNumber + 1);
        }
        throw response;
      }

      return response;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (didTimeout) {
          throw new RequestTimeoutError(timeoutMs);
        }
        throw err;
      }

      if (err instanceof Response) {
        throw err;
      }

      if (attemptNumber < retries) {
        const delayMs = getBackoffDelay(attemptNumber, backoffMs);
        await sleep(delayMs);
        return attempt(attemptNumber + 1);
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };

  return attempt(1);
}
