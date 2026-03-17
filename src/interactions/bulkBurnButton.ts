import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getTagIdForUser } from "../repositories/tagRepo.js";
import { getAllCardsByTag } from "../repositories/collectionRepo.js";
import { deleteUserCard } from "../repositories/userCardRepo.js";
import { addGold } from "../repositories/inventoryRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { resolveBasePrice } from "../utils/cardFormatting.js";
import {
  BULKBURN_CONFIRM_PREFIX,
  BULKBURN_CANCEL_PREFIX,
  findDuplicatesToBurn,
  resolveBurnEntries,
  buildDuplicateBurnView,
  buildTagBurnView,
  type KeepStrategy,
  type TagBurnEntry
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

export async function handleBulkBurnTagPageButton(interaction: ButtonInteraction) {
  // customId format: bulkburn_tag_page:<userId>:<page>:<tagName>:<direction>
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const page = Number(parts[2]);
  // Tag name is between parts[3] and the last part (direction suffix)
  const tagName = parts.slice(3, -1).join(":");

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  await interaction.deferUpdate();

  const tagId = await getTagIdForUser(ownerId, tagName);
  if (tagId == null) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Cards")
          .setDescription("Tag no longer exists. Burn cancelled.")
          .setColor(0xed4245)
          .toJSON()
      ],
      components: []
    });
    return;
  }

  const cards = await getAllCardsByTag(ownerId, tagId);
  if (cards.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Cards")
          .setDescription("No cards found with this tag. They may have already been burned.")
          .setColor(0xed4245)
          .toJSON()
      ],
      components: []
    });
    return;
  }

  const entries: TagBurnEntry[] = [];
  for (const entry of cards) {
    const baseUsd = await resolveBasePrice(entry.card.usdPrice, entry.card.name, entry.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), entry.condition);
    entries.push({ card: entry, gold, baseUsd });
  }

  const view = buildTagBurnView(ownerId, tagName, entries, page);

  await interaction.editReply({
    embeds: [view.embed],
    components: view.components
  });
}

export async function handleBulkBurnDupPageButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const page = Number(parts[2]);
  const keep = (parts[3] ?? "cheapest") as KeepStrategy;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  await interaction.deferUpdate();

  const allEntries = await resolveBurnEntries(ownerId);
  const toBurn = findDuplicatesToBurn(allEntries, keep);

  if (toBurn.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Duplicate Cards")
          .setDescription("No duplicate cards found. They may have already been burned.")
          .setColor(0xed4245)
          .toJSON()
      ],
      components: []
    });
    return;
  }

  const view = buildDuplicateBurnView(ownerId, toBurn, keep, page);

  await interaction.editReply({
    embeds: [view.embed],
    components: view.components
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

  // Re-calculate duplicates at confirmation time
  const allEntries = await resolveBurnEntries(ownerId);
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
