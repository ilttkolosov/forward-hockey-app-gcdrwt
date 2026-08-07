const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Сервер не ответил за ${Math.round(timeoutMs / 1000)} секунд`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
