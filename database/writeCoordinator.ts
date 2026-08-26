const DATABASE_BUSY_RETRY_DELAYS_MS = [150, 350, 750, 1_500, 3_000] as const;

let databaseWriteQueue: Promise<void> = Promise.resolve();

export function isSQLiteBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /database is locked/i.test(message) ||
    /SQLITE_BUSY/i.test(message) ||
    /Error code 5/i.test(message)
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runWithBusyRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = DATABASE_BUSY_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isSQLiteBusyError(error)) throw error;
      await wait(delay);
    }
  }
}

/**
 * SQLite permits only one writer even in WAL mode. The app opens the same
 * database through SQLiteProvider and through background services, so writes
 * from unrelated features must share a process-wide queue rather than queues
 * tied to a particular SQLiteDatabase object.
 *
 * busy retry also covers the notification task, which can run in another JS
 * runtime and therefore cannot participate in this in-memory queue.
 */
export function enqueueDatabaseWrite<T>(operation: () => Promise<T>): Promise<T> {
  const current = databaseWriteQueue
    .catch(() => undefined)
    .then(() => runWithBusyRetry(operation));
  databaseWriteQueue = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}
