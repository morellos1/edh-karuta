import http from "node:http";
import https from "node:https";
import { Agent, setGlobalDispatcher } from "undici";

/**
 * Centralised, keep-alive'd HTTP connection pools for all outbound traffic.
 *
 * The bot previously leaked TCP sockets — 1,600+ Discord connections stuck in
 * TIME_WAIT — because neither discord.js REST (via undici) nor axios (via
 * Node's default https.globalAgent) had keep-alive configured, so every
 * request opened a fresh socket that then sat in TIME_WAIT for ~60s. Under
 * restart loops this exhausted the ephemeral port range and crashed the bot
 * with EADDRNOTAVAIL.
 *
 * Importing this module installs:
 *   1. A single bounded undici Agent as the global dispatcher, which
 *      discord.js 14.x's REST client picks up automatically when no custom
 *      dispatcher is passed.
 *   2. Shared Node http/https Agents exported for axios (Scryfall image
 *      downloads and bulk sync).
 *
 * Must be imported before any discord.js or REST client is constructed.
 */

const undiciAgent = new Agent({
  // Hold idle sockets for 30s so repeated REST calls reuse them instead of
  // re-handshaking.
  keepAliveTimeout: 30_000,
  // Absolute cap on any single connection's lifetime.
  keepAliveMaxTimeout: 600_000,
  // Per-origin max concurrent connections — bounds the Discord socket count.
  connections: 64,
  // Discord REST does not benefit from pipelining multiple in-flight requests
  // on one socket.
  pipelining: 1
});

setGlobalDispatcher(undiciAgent);

const SHARED_AGENT_OPTIONS = {
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 32,
  maxFreeSockets: 8,
  timeout: 60_000,
  scheduling: "lifo" as const
};

export const sharedHttpsAgent = new https.Agent(SHARED_AGENT_OPTIONS);
export const sharedHttpAgent = new http.Agent(SHARED_AGENT_OPTIONS);

export async function closeHttpAgents(): Promise<void> {
  sharedHttpsAgent.destroy();
  sharedHttpAgent.destroy();
  await undiciAgent.close().catch(() => undefined);
}
