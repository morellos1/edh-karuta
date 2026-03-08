import { prisma } from "../db.js";
import { gameConfig } from "../config.js";

const DROP_CHANNEL_KEY = "drop_channel_id";

function colordropCooldownMs(): number {
  return gameConfig.colordropCooldownSeconds * 1000;
}

export async function getDropChannelId(): Promise<string | null> {
  const row = await prisma.botConfig.findUnique({
    where: { key: DROP_CHANNEL_KEY },
    select: { value: true }
  });
  return row?.value ?? null;
}

export async function setDropChannelId(channelId: string): Promise<void> {
  await prisma.botConfig.upsert({
    where: { key: DROP_CHANNEL_KEY },
    create: { key: DROP_CHANNEL_KEY, value: channelId },
    update: { value: channelId }
  });
}

export async function getColordropCooldownRemainingMs(userId: string): Promise<number> {
  const row = await prisma.colordropCooldown.findUnique({
    where: { userId },
    select: { lastUsedAt: true }
  });
  if (!row) return 0;
  const nextAllowed = row.lastUsedAt.getTime() + colordropCooldownMs();
  return Math.max(0, nextAllowed - Date.now());
}

export async function setColordropUsed(userId: string): Promise<void> {
  await prisma.colordropCooldown.upsert({
    where: { userId },
    create: { userId, lastUsedAt: new Date() },
    update: { lastUsedAt: new Date() }
  });
}

function commanderdropCooldownMs(): number {
  return gameConfig.commanderdropCooldownSeconds * 1000;
}

export async function getCommanderdropCooldownRemainingMs(userId: string): Promise<number> {
  const row = await prisma.commanderdropCooldown.findUnique({
    where: { userId },
    select: { lastUsedAt: true }
  });
  if (!row) return 0;
  const nextAllowed = row.lastUsedAt.getTime() + commanderdropCooldownMs();
  return Math.max(0, nextAllowed - Date.now());
}

export async function setCommanderdropUsed(userId: string): Promise<void> {
  await prisma.commanderdropCooldown.upsert({
    where: { userId },
    create: { userId, lastUsedAt: new Date() },
    update: { lastUsedAt: new Date() }
  });
}

function landdropCooldownMs(): number {
  return gameConfig.landdropCooldownSeconds * 1000;
}

export async function getLanddropCooldownRemainingMs(userId: string): Promise<number> {
  const row = await prisma.landdropCooldown.findUnique({
    where: { userId },
    select: { lastUsedAt: true }
  });
  if (!row) return 0;
  const nextAllowed = row.lastUsedAt.getTime() + landdropCooldownMs();
  return Math.max(0, nextAllowed - Date.now());
}

export async function setLanddropUsed(userId: string): Promise<void> {
  await prisma.landdropCooldown.upsert({
    where: { userId },
    create: { userId, lastUsedAt: new Date() },
    update: { lastUsedAt: new Date() }
  });
}

function dropCooldownMs(): number {
  return gameConfig.dropCooldownSeconds * 1000;
}

export async function getDropCooldownRemainingMs(userId: string): Promise<number> {
  if (gameConfig.dropCooldownSeconds <= 0) return 0;
  const row = await prisma.dropCooldown.findUnique({
    where: { userId },
    select: { lastUsedAt: true }
  });
  if (!row) return 0;
  const nextAllowed = row.lastUsedAt.getTime() + dropCooldownMs();
  return Math.max(0, nextAllowed - Date.now());
}

export async function setDropUsed(userId: string): Promise<void> {
  if (gameConfig.dropCooldownSeconds <= 0) return;
  await prisma.dropCooldown.upsert({
    where: { userId },
    create: { userId, lastUsedAt: new Date() },
    update: { lastUsedAt: new Date() }
  });
}
