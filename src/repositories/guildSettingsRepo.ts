import { prisma } from "../db.js";

export interface GuildSettings {
  prefix: string;
  shortcutsEnabled: boolean;
}

const DEFAULT_SETTINGS: GuildSettings = {
  prefix: "k",
  shortcutsEnabled: false
};

const cache = new Map<string, GuildSettings>();

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached) return cached;

  const row = await prisma.guildSettings.findUnique({ where: { guildId } });
  const settings = row
    ? { prefix: row.prefix, shortcutsEnabled: row.shortcutsEnabled }
    : { ...DEFAULT_SETTINGS };
  cache.set(guildId, settings);
  return settings;
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
  await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, prefix, shortcutsEnabled: false },
    update: { prefix }
  });
  const cached = cache.get(guildId);
  if (cached) {
    cached.prefix = prefix;
  } else {
    cache.set(guildId, { ...DEFAULT_SETTINGS, prefix });
  }
}

export async function setShortcutsEnabled(guildId: string, enabled: boolean): Promise<void> {
  await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, prefix: DEFAULT_SETTINGS.prefix, shortcutsEnabled: enabled },
    update: { shortcutsEnabled: enabled }
  });
  const cached = cache.get(guildId);
  if (cached) {
    cached.shortcutsEnabled = enabled;
  } else {
    cache.set(guildId, { ...DEFAULT_SETTINGS, shortcutsEnabled: enabled });
  }
}
