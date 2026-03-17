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
import { buildPaginationRow } from "../utils/pagination.js";
import { SessionStore } from "./sessionStore.js";

export interface MultiTagCard {
  userCardId: number;
  displayId: string;
  name: string;
}

interface MultiTagSession {
  userId: string;
  tagName: string;
  cards: MultiTagCard[];
}

const store = new SessionStore<MultiTagSession>();

export function createMultiTagSession(userId: string, tagName: string, cards: MultiTagCard[]): string {
  return store.create({ userId, tagName, cards });
}

export function getMultiTagSession(id: string): MultiTagSession | undefined {
  return store.get(id);
}

export function deleteMultiTagSession(id: string): void {
  store.delete(id);
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
    rows.push(
      buildPaginationRow(MULTITAG_PAGE_PREFIX, `${userId}:${sessionId}`, safePage, totalPages) as unknown as ActionRowBuilder<ButtonBuilder>
    );
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
