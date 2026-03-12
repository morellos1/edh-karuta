import { prisma } from "../db.js";
import { gameConfig } from "../config.js";

function colordropCooldownMs(): number {
  return gameConfig.colordropCooldownSeconds * 1000;
}

export async function getDropChannelId(guildId: string): Promise<string | null> {
  const row = await prisma.guildSettings.findUnique({
    where: { guildId },
    select: { dropChannelId: true }
  });
  return row?.dropChannelId ?? null;
}

export async function getAllDropChannels(): Promise<{ guildId: string; dropChannelId: string }[]> {
  const rows = await prisma.guildSettings.findMany({
    where: { dropChannelId: { not: null } },
    select: { guildId: true, dropChannelId: true }
  });
  return rows.filter((r): r is { guildId: string; dropChannelId: string } => r.dropChannelId !== null);
}

export async function setDropChannelId(guildId: string, channelId: string): Promise<void> {
  await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, dropChannelId: channelId },
    update: { dropChannelId: channelId }
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
