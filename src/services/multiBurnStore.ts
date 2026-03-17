/**
 * In-memory store for pending multi-burn sessions.
 *
 * When a user does `kmt b id1 id2 id3 ...`, we look up all the cards,
 * store them here keyed by a short session ID, and embed that session ID
 * in the button customIds so the confirm/cancel handlers can retrieve the
 * list of cards to burn.
 */

import type { ActionRowBuilder, APIEmbed, ButtonBuilder } from "discord.js";
import {
  EmbedBuilder,
  ActionRowBuilder as ActionRowBuilderClass,
  ButtonBuilder as ButtonBuilderClass,
  ButtonStyle
} from "discord.js";
import { conditionToStars } from "../utils/cardFormatting.js";
import { buildPaginationRow } from "../utils/pagination.js";
import { SessionStore } from "./sessionStore.js";

export interface MultiBurnCard {
  userCardId: number;
  displayId: string;
  name: string;
  setCode: string;
  condition: string;
  gold: number;
}

interface MultiBurnSession {
  userId: string;
  cards: MultiBurnCard[];
}

const store = new SessionStore<MultiBurnSession>();

export function createMultiBurnSession(userId: string, cards: MultiBurnCard[]): string {
  return store.create({ userId, cards });
}

export function getMultiBurnSession(id: string): MultiBurnSession | undefined {
  return store.get(id);
}

export function deleteMultiBurnSession(id: string): void {
  store.delete(id);
}

// ── View builder ──────────────────────────────────────────────────────

export const MULTIBURN_CONFIRM_PREFIX = "multiburn_confirm";
export const MULTIBURN_CANCEL_PREFIX = "multiburn_cancel";
export const MULTIBURN_PAGE_PREFIX = "multiburn_page";

const PAGE_SIZE = 10;

export function buildMultiBurnView(
  userId: string,
  sessionId: string,
  cards: MultiBurnCard[],
  page: number
): {
  embed: APIEmbed;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = cards.slice(start, start + PAGE_SIZE);

  const totalGold = cards.reduce((sum, c) => sum + c.gold, 0);

  const lines = pageItems.map((c, i) => {
    const idx = start + i + 1;
    const stars = conditionToStars(c.condition);
    const set = c.setCode.toUpperCase();
    return `**${idx}.** \`${c.displayId}\` · \`${stars}\` · **${c.name}** (${set}) · ${c.gold} gold`;
  });

  const description = [
    `<@${userId}>, you will receive:`,
    "",
    `💰 **${totalGold} Gold**\\*`,
    "",
    `Burning **${cards.length}** card${cards.length !== 1 ? "s" : ""}:`,
    "",
    ...lines
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Burn Cards")
    .setDescription(description)
    .setColor(0x808080)
    .setFooter({ text: `*Gold values are approximate · Page ${safePage}/${totalPages} · ${cards.length} cards` });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Row 1: pagination (only if more than 1 page)
  if (totalPages > 1) {
    rows.push(
      buildPaginationRow(MULTIBURN_PAGE_PREFIX, `${userId}:${sessionId}`, safePage, totalPages) as unknown as ActionRowBuilder<ButtonBuilder>
    );
  }

  // Row 2 (or 1): confirm / cancel
  const actionRow = new ActionRowBuilderClass<ButtonBuilderClass>().addComponents(
    new ButtonBuilderClass()
      .setCustomId(`${MULTIBURN_CANCEL_PREFIX}:${userId}:${sessionId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌"),
    new ButtonBuilderClass()
      .setCustomId(`${MULTIBURN_CONFIRM_PREFIX}:${userId}:${sessionId}`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔥")
      .setLabel("Burn All")
  );
  rows.push(actionRow as unknown as ActionRowBuilder<ButtonBuilder>);

  return { embed: embed.toJSON(), components: rows };
}
