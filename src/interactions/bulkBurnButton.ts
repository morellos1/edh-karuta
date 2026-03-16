import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getTagIdForUser } from "../repositories/tagRepo.js";
import { getAllCardsByTag } from "../repositories/collectionRepo.js";
import { deleteUserCard, getAllUserCards } from "../repositories/userCardRepo.js";
import { addGold } from "../repositories/inventoryRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { resolveBasePrice } from "../utils/cardFormatting.js";
import {
  BULKBURN_CONFIRM_PREFIX,
  BULKBURN_CANCEL_PREFIX,
  findDuplicatesToBurn,
  type KeepStrategy,
  type DuplicateBurnEntry
} from "../commands/bulkburn.js";

export async function handleBulkBurnConfirmButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const tagName = parts.slice(2).join(":"); // tag name may contain colons

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const tagId = await getTagIdForUser(ownerId, tagName);
  if (tagId == null) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Cards")
          .setDescription("Tag no longer exists. Burn cancelled.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  const cards = await getAllCardsByTag(ownerId, tagId);
  if (cards.length === 0) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Cards")
          .setDescription("No cards found with this tag. They may have already been burned.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  // Calculate gold and delete cards
  let totalGold = 0;
  for (const entry of cards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    totalGold += gold;
    await deleteUserCard(entry.id);
  }

  await addGold(ownerId, totalGold);

  const embed = new EmbedBuilder()
    .setTitle("Burn Cards")
    .setDescription(
      [
        `<@${ownerId}>, you received:`,
        "",
        `💰 **${totalGold} Gold**`,
        "",
        `**${cards.length} cards have been burned.**`
      ].join("\n")
    )
    .setColor(0x57f287); // green

  await interaction.update({
    embeds: [embed],
    components: []
  });
}

export async function handleBulkBurnCancelButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const tagName = parts.slice(2).join(":");

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Burn Cards")
    .setDescription(
      [
        `<@${ownerId}>`,
        "",
        `**Card burning has been canceled.**`
      ].join("\n")
    )
    .setColor(0xed4245); // red

  await interaction.update({
    embeds: [embed],
    components: []
  });
}

export async function handleBulkBurnDupConfirmButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const keep = (parts[2] ?? "cheapest") as KeepStrategy;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const allCards = await getAllUserCards(ownerId);
  if (allCards.length === 0) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Duplicate Cards")
          .setDescription("No cards found. They may have already been burned.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  // Re-calculate duplicates at confirmation time
  const allEntries: DuplicateBurnEntry[] = [];
  for (const entry of allCards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    allEntries.push({ card: entry, gold, baseUsd });
  }

  const toBurn = findDuplicatesToBurn(allEntries, keep);

  if (toBurn.length === 0) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Duplicate Cards")
          .setDescription("No duplicate cards found. They may have already been burned.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  let totalGold = 0;
  for (const entry of toBurn) {
    totalGold += entry.gold;
    await deleteUserCard(entry.card.id);
  }

  await addGold(ownerId, totalGold);

  const embed = new EmbedBuilder()
    .setTitle("Burn Duplicate Cards")
    .setDescription(
      [
        `<@${ownerId}>, you received:`,
        "",
        `💰 **${totalGold} Gold**`,
        "",
        `**${toBurn.length} duplicate cards have been burned.**`
      ].join("\n")
    )
    .setColor(0x57f287); // green

  await interaction.update({
    embeds: [embed],
    components: []
  });
}

export async function handleBulkBurnDupCancelButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Burn Duplicate Cards")
    .setDescription(
      [
        `<@${ownerId}>`,
        "",
        `**Card burning has been canceled.**`
      ].join("\n")
    )
    .setColor(0xed4245); // red

  await interaction.update({
    embeds: [embed],
    components: []
  });
}
