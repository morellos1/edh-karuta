/**
 * In-memory store for pending multi-tag sessions.
 *
 * Mirrors the multiBurnStore pattern: resolve cards up-front, store them
 * keyed by a short session ID, embed the session ID in button customIds,
 * and tag on confirm.  Sessions expire after 5 minutes.
 */

import type { ActionRowBuilder, APIEmbed, ButtonBuilder } from "discord.js";
import {
  EmbedBuilder,
  ActionRowBuilder as ActionRowBuilderClass,
  ButtonBuilder as ButtonBuilderClass,
  ButtonStyle
} from "discord.js";

export interface MultiTagCard {
  userCardId: number;
  displayId: string;
  name: string;
}

interface MultiTagSession {
  userId: string;
  tagName: string;
  cards: MultiTagCard[];
  createdAt: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const sessions = new Map<string, MultiTagSession>();

let counter = 0;

function generateSessionId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Purge expired sessions (called lazily). */
function purgeExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createMultiTagSession(userId: string, tagName: string, cards: MultiTagCard[]): string {
  purgeExpired();
  const id = generateSessionId();
  sessions.set(id, { userId, tagName, cards, createdAt: Date.now() });
  return id;
}

export function getMultiTagSession(id: string): MultiTagSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function deleteMultiTagSession(id: string): void {
  sessions.delete(id);
}

// ── View builder ──────────────────────────────────────────────────────

export const MULTITAG_CONFIRM_PREFIX = "multitag_confirm";
export const MULTITAG_CANCEL_PREFIX = "multitag_cancel";
export const MULTITAG_PAGE_PREFIX = "multitag_page";

const PAGE_SIZE = 10;

export function buildMultiTagView(
  userId: string,
  sessionId: string,
  tagName: string,
  cards: MultiTagCard[],
  page: number
): {
  embed: APIEmbed;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = cards.slice(start, start + PAGE_SIZE);

  const lines = pageItems.map((c, i) => {
    const idx = start + i + 1;
    return `**${idx}.** \`${c.displayId}\` · **${c.name}**`;
  });

  const description = [
    `<@${userId}>, tagging **${cards.length}** card${cards.length !== 1 ? "s" : ""} with **${tagName}**:`,
    "",
    ...lines
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Tag Cards")
    .setDescription(description)
    .setColor(0x5865f2)
    .setFooter({ text: `Page ${safePage}/${totalPages} · ${cards.length} cards` });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Row 1: pagination (only if more than 1 page)
  if (totalPages > 1) {
    const paginationRow = new ActionRowBuilderClass<ButtonBuilderClass>().addComponents(
      new ButtonBuilderClass()
        .setCustomId(`${MULTITAG_PAGE_PREFIX}:${userId}:1:${sessionId}:first`)
        .setLabel("⏮")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 1),
      new ButtonBuilderClass()
        .setCustomId(`${MULTITAG_PAGE_PREFIX}:${userId}:${safePage - 1}:${sessionId}:prev`)
        .setLabel("⬅")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 1),
      new ButtonBuilderClass()
        .setCustomId(`${MULTITAG_PAGE_PREFIX}:${userId}:${safePage + 1}:${sessionId}:next`)
        .setLabel("➡")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages),
      new ButtonBuilderClass()
        .setCustomId(`${MULTITAG_PAGE_PREFIX}:${userId}:${totalPages}:${sessionId}:last`)
        .setLabel("⏭")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages)
    );
    rows.push(paginationRow as unknown as ActionRowBuilder<ButtonBuilder>);
  }

  // Row 2 (or 1): confirm / cancel
  const actionRow = new ActionRowBuilderClass<ButtonBuilderClass>().addComponents(
    new ButtonBuilderClass()
      .setCustomId(`${MULTITAG_CANCEL_PREFIX}:${userId}:${sessionId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌"),
    new ButtonBuilderClass()
      .setCustomId(`${MULTITAG_CONFIRM_PREFIX}:${userId}:${sessionId}`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🏷️")
      .setLabel("Tag All")
  );
  rows.push(actionRow as unknown as ActionRowBuilder<ButtonBuilder>);

  return { embed: embed.toJSON(), components: rows };
}
