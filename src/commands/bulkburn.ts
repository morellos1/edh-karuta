import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
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

const PREVIEW_COUNT = 5;

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
  const cardGolds: { card: (typeof cards)[number]; gold: number; baseUsd: number }[] = [];
  for (const entry of cards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    cardGolds.push({ card: entry, gold, baseUsd });
  }

  const totalGold = cardGolds.reduce((sum, c) => sum + c.gold, 0);

  // Build preview lines (first N cards)
  const previewLines = cardGolds.slice(0, PREVIEW_COUNT).map((c) => {
    const stars = conditionToStars(c.card.condition);
    const set = c.card.card.setCode.toUpperCase();
    return `🔥 \`${c.card.displayId}\` · \`${stars}\` · **${c.card.card.name}** (${set})`;
  });

  const description = [
    `<@${userId}>, you will receive:`,
    "",
    `💰 **${totalGold} Gold**\\*`,
    "",
    `You are burning these **${cards.length}** cards:`,
    ...previewLines
  ].join("\n");

  const footerParts = ["*Gold values are approximate"];
  if (cards.length > PREVIEW_COUNT) {
    footerParts.push(`Showing cards 1–${PREVIEW_COUNT} of ${cards.length}`);
  }

  const embed = new EmbedBuilder()
    .setTitle("Burn Cards")
    .setDescription(description)
    .setColor(0x808080)
    .setFooter({ text: footerParts.join(" · ") });

  // Encode tag name in customId so the button handler can re-query
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });
}

async function executeDuplicates(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const keep = (interaction.options.getString("keep") ?? "cheapest") as KeepStrategy;

  await interaction.deferReply();

  const allCards = await getAllUserCards(userId);
  if (allCards.length === 0) {
    await interaction.editReply({ content: "You have no cards in your collection." });
    return;
  }

  // Calculate gold for each card
  const allEntries: DuplicateBurnEntry[] = [];
  for (const entry of allCards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    allEntries.push({ card: entry, gold, baseUsd });
  }

  const toBurn = findDuplicatesToBurn(allEntries, keep);

  if (toBurn.length === 0) {
    await interaction.editReply({ content: "You have no duplicate cards to burn." });
    return;
  }

  const totalGold = toBurn.reduce((sum, c) => sum + c.gold, 0);
  const keepLabel = keep === "cheapest" ? "cheapest" : "most expensive";

  // Build preview lines (first N cards to burn)
  const previewLines = toBurn.slice(0, PREVIEW_COUNT).map((c) => {
    const stars = conditionToStars(c.card.condition);
    const set = c.card.card.setCode.toUpperCase();
    return `🔥 \`${c.card.displayId}\` · \`${stars}\` · **${c.card.card.name}** (${set}) · ${c.gold} gold`;
  });

  const description = [
    `<@${userId}>, you will receive:`,
    "",
    `💰 **${totalGold} Gold**\\*`,
    "",
    `Burning **${toBurn.length}** duplicate cards (keeping the **${keepLabel}** copy of each):`,
    ...previewLines
  ].join("\n");

  const footerParts = ["*Gold values are approximate"];
  if (toBurn.length > PREVIEW_COUNT) {
    footerParts.push(`Showing cards 1–${PREVIEW_COUNT} of ${toBurn.length}`);
  }

  const embed = new EmbedBuilder()
    .setTitle("Burn Duplicate Cards")
    .setDescription(description)
    .setColor(0x808080)
    .setFooter({ text: footerParts.join(" · ") });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });
}
