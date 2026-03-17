import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  type APIEmbed
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { getTagIdForUser } from "../repositories/tagRepo.js";
import { getAllCardsByTag } from "../repositories/collectionRepo.js";
import { getAllUserCards } from "../repositories/userCardRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { resolveBasePrice, conditionToStars } from "../utils/cardFormatting.js";

export const BULKBURN_CONFIRM_PREFIX = "bulkburn_confirm";
export const BULKBURN_CANCEL_PREFIX = "bulkburn_cancel";
export const BULKBURN_DUP_CONFIRM_PREFIX = "bulkburn_dup_confirm";
export const BULKBURN_DUP_CANCEL_PREFIX = "bulkburn_dup_cancel";
export const BULKBURN_DUP_PAGE_PREFIX = "bulkburn_dup_page";
export const BULKBURN_TAG_PAGE_PREFIX = "bulkburn_tag_page";

const TAG_PAGE_SIZE = 10;
const DUP_PAGE_SIZE = 10;

export type KeepStrategy = "cheapest" | "highest";

export interface DuplicateBurnEntry {
  card: Awaited<ReturnType<typeof getAllUserCards>>[number];
  gold: number;
  baseUsd: number;
}

/**
 * Given all user cards with resolved gold values, find duplicates by card name
 * and return the entries that should be burned (everything except the kept copy).
 */
export function findDuplicatesToBurn(
  allEntries: DuplicateBurnEntry[],
  keep: KeepStrategy
): DuplicateBurnEntry[] {
  // Group by card name
  const groups = new Map<string, DuplicateBurnEntry[]>();
  for (const entry of allEntries) {
    const name = entry.card.card.name;
    const group = groups.get(name);
    if (group) {
      group.push(entry);
    } else {
      groups.set(name, [entry]);
    }
  }

  const toBurn: DuplicateBurnEntry[] = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    // Sort by gold value: ascending for "cheapest" (keep first = cheapest),
    // descending for "highest" (keep first = highest)
    group.sort((a, b) =>
      keep === "cheapest" ? a.gold - b.gold : b.gold - a.gold
    );

    // Keep the first (the one we want to keep), burn the rest
    toBurn.push(...group.slice(1));
  }

  return toBurn;
}

/**
 * Resolve all user cards into DuplicateBurnEntry[] with gold values.
 */
export async function resolveBurnEntries(userId: string): Promise<DuplicateBurnEntry[]> {
  const allCards = await getAllUserCards(userId);
  const allEntries: DuplicateBurnEntry[] = [];
  for (const entry of allCards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    allEntries.push({ card: entry, gold, baseUsd });
  }
  return allEntries;
}

/**
 * Build the paginated embed + components for the duplicates burn confirmation.
 */
export function buildDuplicateBurnView(
  userId: string,
  toBurn: DuplicateBurnEntry[],
  keep: KeepStrategy,
  page: number
): {
  embed: APIEmbed;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(toBurn.length / DUP_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * DUP_PAGE_SIZE;
  const pageItems = toBurn.slice(start, start + DUP_PAGE_SIZE);

  const totalGold = toBurn.reduce((sum, c) => sum + c.gold, 0);
  const keepLabel = keep === "cheapest" ? "cheapest" : "most expensive";

  const lines = pageItems.map((c, i) => {
    const idx = start + i + 1;
    const stars = conditionToStars(c.card.condition);
    const set = c.card.card.setCode.toUpperCase();
    return `**${idx}.** \`${c.card.displayId}\` · \`${stars}\` · **${c.card.card.name}** (${set}) · ${c.gold} gold`;
  });

  const description = [
    `<@${userId}>, you will receive:`,
    "",
    `💰 **${totalGold} Gold**\\*`,
    "",
    `Burning **${toBurn.length}** duplicate cards (keeping the **${keepLabel}** copy of each):`,
    "",
    ...lines
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Burn Duplicate Cards")
    .setDescription(description)
    .setColor(0x808080)
    .setFooter({ text: `*Gold values are approximate · Page ${safePage}/${totalPages} · ${toBurn.length} cards` });

  // Row 1: pagination (suffix ensures unique customIds even when page numbers collide)
  const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_DUP_PAGE_PREFIX}:${userId}:1:${keep}:first`)
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_DUP_PAGE_PREFIX}:${userId}:${safePage - 1}:${keep}:prev`)
      .setLabel("⬅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_DUP_PAGE_PREFIX}:${userId}:${safePage + 1}:${keep}:next`)
      .setLabel("➡")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_DUP_PAGE_PREFIX}:${userId}:${totalPages}:${keep}:last`)
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages)
  );

  // Row 2: confirm / cancel
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_DUP_CANCEL_PREFIX}:${userId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌"),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_DUP_CONFIRM_PREFIX}:${userId}:${keep}`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔥")
      .setLabel("Burn Duplicates")
  );

  return {
    embed: embed.toJSON(),
    components: [paginationRow, actionRow]
  };
}

export interface TagBurnEntry {
  card: Awaited<ReturnType<typeof getAllCardsByTag>>[number];
  gold: number;
  baseUsd: number;
}

/**
 * Build the paginated embed + components for the tag burn confirmation.
 */
export function buildTagBurnView(
  userId: string,
  tagName: string,
  entries: TagBurnEntry[],
  page: number
): {
  embed: APIEmbed;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(entries.length / TAG_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * TAG_PAGE_SIZE;
  const pageItems = entries.slice(start, start + TAG_PAGE_SIZE);

  const totalGold = entries.reduce((sum, c) => sum + c.gold, 0);

  const lines = pageItems.map((c, i) => {
    const idx = start + i + 1;
    const stars = conditionToStars(c.card.condition);
    const set = c.card.card.setCode.toUpperCase();
    return `**${idx}.** \`${c.card.displayId}\` · \`${stars}\` · **${c.card.card.name}** (${set}) · ${c.gold} gold`;
  });

  const description = [
    `<@${userId}>, you will receive:`,
    "",
    `💰 **${totalGold} Gold**\\*`,
    "",
    `You are burning these **${entries.length}** cards:`,
    "",
    ...lines
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Burn Cards")
    .setDescription(description)
    .setColor(0x808080)
    .setFooter({ text: `*Gold values are approximate · Page ${safePage}/${totalPages} · ${entries.length} cards` });

  // Row 1: pagination
  const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_TAG_PAGE_PREFIX}:${userId}:1:${tagName}:first`)
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_TAG_PAGE_PREFIX}:${userId}:${safePage - 1}:${tagName}:prev`)
      .setLabel("⬅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_TAG_PAGE_PREFIX}:${userId}:${safePage + 1}:${tagName}:next`)
      .setLabel("➡")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_TAG_PAGE_PREFIX}:${userId}:${totalPages}:${tagName}:last`)
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages)
  );

  // Row 2: confirm / cancel
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_CANCEL_PREFIX}:${userId}:${tagName}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌"),
    new ButtonBuilder()
      .setCustomId(`${BULKBURN_CONFIRM_PREFIX}:${userId}:${tagName}`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔥")
      .setLabel("Burn All")
  );

  return {
    embed: embed.toJSON(),
    components: [paginationRow, actionRow]
  };
}

export const bulkburnCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("bulkburn")
    .setDescription("Burn cards in bulk.")
    .addSubcommand((sub) =>
      sub
        .setName("tag")
        .setDescription("Burn all cards with a given tag in exchange for gold.")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Tag name — all cards with this tag will be burned")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("duplicates")
        .setDescription("Burn duplicate cards, keeping one copy of each.")
        .addStringOption((opt) =>
          opt
            .setName("keep")
            .setDescription("Which copy to keep (default: cheapest)")
            .addChoices(
              { name: "cheapest", value: "cheapest" },
              { name: "highest", value: "highest" }
            )
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "tag") {
      await executeTag(interaction);
    } else if (subcommand === "duplicates") {
      await executeDuplicates(interaction);
    }
  }
};

async function executeTag(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const tagName = interaction.options.getString("name", true).trim();

  const tagId = await getTagIdForUser(userId, tagName);
  if (tagId == null) {
    await interaction.reply({
      content: "Tag not found. Use `/tags` to list your tags.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const cards = await getAllCardsByTag(userId, tagId);
  if (cards.length === 0) {
    await interaction.editReply({
      content: `No cards found with tag **${tagName}**.`
    });
    return;
  }

  // Calculate gold for each card
  const entries: TagBurnEntry[] = [];
  for (const entry of cards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    entries.push({ card: entry, gold, baseUsd });
  }

  const view = buildTagBurnView(userId, tagName, entries, 1);

  await interaction.editReply({
    embeds: [view.embed],
    components: view.components
  });
}

async function executeDuplicates(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const keep = (interaction.options.getString("keep") ?? "cheapest") as KeepStrategy;

  await interaction.deferReply();

  const allEntries = await resolveBurnEntries(userId);
  if (allEntries.length === 0) {
    await interaction.editReply({ content: "You have no cards in your collection." });
    return;
  }

  const toBurn = findDuplicatesToBurn(allEntries, keep);

  if (toBurn.length === 0) {
    await interaction.editReply({ content: "You have no duplicate cards to burn." });
    return;
  }

  const view = buildDuplicateBurnView(userId, toBurn, keep, 1);

  await interaction.editReply({
    embeds: [view.embed],
    components: view.components
  });
}
