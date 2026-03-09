import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getUserCardById, deleteUserCard } from "../repositories/userCardRepo.js";
import { addGold } from "../repositories/inventoryRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { getCardImageUrl, resolveBasePrice } from "../utils/cardFormatting.js";
import { BURN_CONFIRM_PREFIX, BURN_CANCEL_PREFIX } from "../commands/burn.js";

export async function handleBurnConfirmButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const userCardId = Number(parts[2]);
  if (!ownerId || !Number.isInteger(userCardId)) {
    await interaction.reply({ content: "Invalid burn payload.", ephemeral: true }).catch(() => {});
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const userCard = await getUserCardById(userCardId);
  if (!userCard || userCard.userId !== interaction.user.id) {
    await interaction.update({ content: "This card is no longer available to burn.", components: [] }).catch(() => {});
    return;
  }

  const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name);
  const gold = getGoldValue(String(baseUsd), userCard.condition);
  const image = getCardImageUrl(userCard.card);

  await deleteUserCard(userCardId);
  await addGold(interaction.user.id, gold);

  const embed = new EmbedBuilder()
    .setTitle("Burn Card")
    .setDescription(`<@${interaction.user.id}>, you will receive:`)
    .addFields(
      {
        name: "\u200b",
        value: `💰 **${gold} Gold**`,
        inline: false
      },
      {
        name: "\u200b",
        value: "**Card has been burned.**",
        inline: false
      }
    )
    .setColor(0x57f287); // green

  if (image) {
    embed.setImage(image);
  }

  await interaction.update({
    embeds: [embed],
    components: []
  });
}

export async function handleBurnCancelButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const userCardId = Number(parts[2]);
  if (!ownerId || !Number.isInteger(userCardId)) {
    await interaction.reply({ content: "Invalid burn payload.", ephemeral: true }).catch(() => {});
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const userCard = await getUserCardById(userCardId);
  const userId = interaction.user.id;
  if (!userCard || userCard.userId !== userId) {
    await interaction.update({ content: "This card is no longer available to burn.", components: [] }).catch(() => {});
    return;
  }

  const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name);
  const gold = getGoldValue(String(baseUsd), userCard.condition);
  const image = getCardImageUrl(userCard.card);

  const embed = new EmbedBuilder()
    .setTitle("Burn Card")
    .setDescription(`<@${userId}>, you will receive:`)
    .addFields(
      {
        name: "\u200b",
        value: `💰 **${gold} Gold**`,
        inline: false
      },
      {
        name: "\u200b",
        value: "**Burn has been cancelled.**",
        inline: false
      }
    )
    .setColor(0xed4245); // red

  if (image) {
    embed.setImage(image);
  }

  await interaction.update({
    embeds: [embed],
    components: []
  });
}
