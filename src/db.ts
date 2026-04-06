import { PrismaClient } from "@prisma/client";
import { env } from "./config.js";

const slowQueryMs = env.LOG_SLOW_QUERY_MS ?? 500;
const queryLoggingEnabled = slowQueryMs != null;

export const prisma = new PrismaClient({
  log: queryLoggingEnabled
    ? [{ emit: "event", level: "query" }]
    : []
});

if (queryLoggingEnabled) {
  prisma.$on("query" as never, (e: unknown) => {
    const event = e as { query: string; params: string; duration: number };
    if (event.duration >= slowQueryMs) {
      console.log(
        `[SLOW QUERY] ${event.duration}ms | ${event.query} | params: ${event.params}`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// SQLite performance PRAGMAs
// ---------------------------------------------------------------------------
// WAL mode: allows concurrent readers while a write is in progress.  This is
// the single biggest performance win for a read-heavy SQLite workload.
// busy_timeout: wait up to 5s when the DB is locked instead of failing
// immediately — important during Scryfall syncs or burst claim transactions.
// cache_size: negative value = KiB.  -20000 ≈ 20 MB page cache (default is
// ~2 MB), keeping hot index pages in memory.
async function configureSqlitePragmas(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL");
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
    await prisma.$executeRawUnsafe("PRAGMA cache_size = -20000");
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    await prisma.$executeRawUnsafe("PRAGMA optimize");
  } catch {
    // Non-fatal: PRAGMAs are best-effort (e.g. if the DB is not SQLite).
  }
}

/** Re-analyze tables whose stats are stale. Call after large bulk operations. */
export async function runPragmaOptimize(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe("PRAGMA optimize");
  } catch {
    // Non-fatal
  }
}

void configureSqlitePragmas();
