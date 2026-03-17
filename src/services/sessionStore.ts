/**
 * Generic in-memory session store for pending multi-action sessions.
 *
 * Used by multiBurnStore and multiTagStore to avoid duplicating the
 * identical session lifecycle logic (create, get, delete, purge).
 *
 * Sessions expire after SESSION_TTL_MS to avoid unbounded memory growth.
 */

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface SessionWrapper<T> {
  data: T;
  createdAt: number;
}

let counter = 0;

function generateSessionId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

export class SessionStore<T> {
  private sessions = new Map<string, SessionWrapper<T>>();

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  create(data: T): string {
    this.purgeExpired();
    const id = generateSessionId();
    this.sessions.set(id, { data, createdAt: Date.now() });
    return id;
  }

  get(id: string): T | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    return session.data;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }
}
