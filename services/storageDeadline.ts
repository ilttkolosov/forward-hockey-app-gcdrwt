// A stalled native storage call must not hold the splash screen or a request
// forever. The native operation itself cannot be cancelled; callers must stop
// scheduling further writes after a timeout.
export class StorageDeadlineError extends Error {
  constructor() {
    super('Storage operation timed out');
    this.name = 'StorageDeadlineError';
  }
}

export async function withStorageDeadline<T>(task: Promise<T>, timeoutMs = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StorageDeadlineError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
