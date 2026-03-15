import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  /** Log DB queries slower than this (ms). 0 = log all queries. Omit to disable. */
  LOG_SLOW_QUERY_MS: z.coerce.number().int().min(0).optional()
});

export const env = envSchema.parse(process.env);

const gameConfigPath = join(process.cwd(), "game.config.json");

const gameConfigSchema = z.object({
  maxWishlistSlots: z.number().int().min(1).default(10),
  claimCooldownSeconds: z.number().int().min(0),
  dropExpireSeconds: z.number().int().min(1),
  dropCooldownSeconds: z.number().int().min(0),
  colordropCooldownSeconds: z.number().int().min(0),
  commanderdropCooldownSeconds: z.number().int().min(0),
  landdropCooldownSeconds: z.number().int().min(0),
  autoDropIntervalSeconds: z.number().int().min(1),
  toolshop: z.object({
    extraClaimPrice: z.number().int().min(0).default(25000),
    extraCommanderDropPrice: z.number().int().min(0).default(10000)
  }).default({ extraClaimPrice: 25000, extraCommanderDropPrice: 10000 }),
  dropRarity: z.object({
    commonChance: z.number().min(0).max(1),
    uncommonChance: z.number().min(0).max(1),
    rareChance: z.number().min(0).max(1),
    mythicChance: z.number().min(0).max(1)
  }),
  dropCondition: z.object({
    poorChance: z.number().min(0).max(1),
    goodChance: z.number().min(0).max(1),
    mintChance: z.number().min(0).max(1),
    poorMultiplier: z.number().min(0),
    goodMultiplier: z.number().min(0),
    mintMultiplier: z.number().min(0)
  }),
  clash: z.object({
    challengeExpireSeconds: z.number().int().min(1).default(60),
    maxAttacks: z.number().int().min(1).default(100),
    editDelayMs: z.number().int().min(500).default(2000)
  }).default({ challengeExpireSeconds: 60, maxAttacks: 100, editDelayMs: 2000 })
});

const gameConfigRaw = JSON.parse(readFileSync(gameConfigPath, "utf-8"));
export const gameConfig = gameConfigSchema.parse(gameConfigRaw);

/** Condition name → price multiplier. Used for gold value = baseUsd × 100 × multiplier. */
export const CONDITION_MULTIPLIERS: Record<string, number> = {
  poor: gameConfig.dropCondition.poorMultiplier,
  good: gameConfig.dropCondition.goodMultiplier,
  mint: gameConfig.dropCondition.mintMultiplier
};
