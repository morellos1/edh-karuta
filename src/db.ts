import { PrismaClient } from "@prisma/client";
import { env } from "./config.js";

const slowQueryMs = env.LOG_SLOW_QUERY_MS;
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
