export type MessengerTransportPriority = "foreground" | "normal" | "background";

const DEFAULT_TIMEOUTS_MS: Record<MessengerTransportPriority, number> = {
  foreground: 10_000,
  normal: 15_000,
  background: 8_000,
};

type TransportTaskOptions = {
  priority?: MessengerTransportPriority;
  timeoutMs?: number;
  signal?: AbortSignal | null;
};

type BackgroundWaiter = () => void;

let foregroundRequests = 0;
let backgroundRequestActive = false;
let backgroundGeneration = 0;
const activeBackgroundControllers = new Set<AbortController>();
const backgroundWaiters = new Set<BackgroundWaiter>();

function wakeBackgroundWaiters(): void {
  const waiters = [...backgroundWaiters];
  backgroundWaiters.clear();
  waiters.forEach((wake) => wake());
}

function abortError(): Error {
  const error = new Error("Запрос отменён");
  error.name = "AbortError";
  return error;
}

export class MessengerTransportTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Сервер не ответил за ${Math.ceil(timeoutMs / 1000)} секунд`);
    this.name = "MessengerTransportTimeoutError";
  }
}

export class MessengerBackgroundRequestCancelledError extends Error {
  constructor() {
    super("Фоновый запрос уступил активной операции");
    this.name = "MessengerBackgroundRequestCancelledError";
  }
}

/**
 * Gives the user-visible operation the network lane immediately. Any cache
 * warm-up already in native fetch is cancelled; it can be safely retried from
 * SQLite/server later and must never delay opening a room or sending text.
 */
export function prioritizeMessengerForegroundTransport(): void {
  backgroundGeneration += 1;
  activeBackgroundControllers.forEach((controller) => controller.abort());
  wakeBackgroundWaiters();
}

async function acquireBackgroundLane(
  signal: AbortSignal | null | undefined,
  generation: number,
): Promise<void> {
  while (foregroundRequests > 0 || backgroundRequestActive) {
    if (signal?.aborted) throw abortError();
    if (generation !== backgroundGeneration) {
      throw new MessengerBackgroundRequestCancelledError();
    }
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        backgroundWaiters.delete(wake);
        reject(abortError());
      };
      backgroundWaiters.add(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  if (generation !== backgroundGeneration) {
    throw new MessengerBackgroundRequestCancelledError();
  }
  backgroundRequestActive = true;
}

/** Runs one native fetch with cancellation, a deadline and a priority lane. */
export async function runMessengerTransportTask<T>(
  options: TransportTaskOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const priority = options.priority ?? "normal";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUTS_MS[priority];
  const generation = backgroundGeneration;
  let backgroundAcquired = false;

  if (priority === "foreground") {
    foregroundRequests += 1;
    prioritizeMessengerForegroundTransport();
  } else if (priority === "background") {
    await acquireBackgroundLane(options.signal, generation);
    backgroundAcquired = true;
  }

  const controller = new AbortController();
  let timedOut = false;
  let displacedByForeground = false;
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  if (priority === "background") activeBackgroundControllers.add(controller);

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw new MessengerTransportTimeoutError(timeoutMs);
    if (
      priority === "background" &&
      (generation !== backgroundGeneration ||
        (!options.signal?.aborted && controller.signal.aborted))
    ) {
      displacedByForeground = true;
      throw new MessengerBackgroundRequestCancelledError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onExternalAbort);
    if (priority === "background") {
      activeBackgroundControllers.delete(controller);
      if (backgroundAcquired) backgroundRequestActive = false;
    } else if (priority === "foreground") {
      foregroundRequests = Math.max(0, foregroundRequests - 1);
    }
    if (
      displacedByForeground ||
      foregroundRequests === 0 ||
      backgroundAcquired
    ) {
      wakeBackgroundWaiters();
    }
  }
}
