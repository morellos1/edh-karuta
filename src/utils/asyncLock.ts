/**
 * Per-key async mutex. Ensures that for a given key, only one async
 * operation runs at a time — subsequent callers wait for all prior
 * callers to finish before starting.
 */
export function createAsyncLock() {
  const locks = new Map<string, Promise<void>>();

  return async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    let release: () => void;
    const lock = new Promise<void>((r) => {
      release = r;
    });
    locks.set(key, lock);
    await prev;
    try {
      return await fn();
    } finally {
      release!();
      if (locks.get(key) === lock) {
        locks.delete(key);
      }
    }
  };
}
