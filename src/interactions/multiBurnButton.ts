import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getUserCardById, deleteUserCard } from "../repositories/userCardRepo.js";
import { addGold } from "../repositories/inventoryRepo.js";
import {
  getMultiBurnSession,
  deleteMultiBurnSession,
  buildMultiBurnView,
  MULTIBURN_CONFIRM_PREFIX,
  MULTIBURN_CANCEL_PREFIX,
  MULTIBURN_PAGE_PREFIX
} from "../services/multiBurnStore.js";

export { MULTIBURN_CONFIRM_PREFIX, MULTIBURN_CANCEL_PREFIX, MULTIBURN_PAGE_PREFIX };

export async function handleMultiBurnConfirmButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const sessionId = parts[2];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const session = getMultiBurnSession(sessionId);
  if (!session) {
    await interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Cards")
          .setDescription("This burn session has expired. Please try again.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  // Burn all cards, tracking which ones are still valid
  let totalGold = 0;
  let burnedCount = 0;
  for (const card of session.cards) {
    const uc = await getUserCardById(card.userCardId);
    if (!uc || uc.userId !== ownerId) continue;
    await deleteUserCard(card.userCardId);
    totalGold += card.gold;
    burnedCount++;
  }

  if (burnedCount > 0) {
    await addGold(ownerId, totalGold);
  }

  deleteMultiBurnSession(sessionId);

  const embed = new EmbedBuilder()
    .setTitle("Burn Cards")
    .setDescription(
      [
        `<@${ownerId}>, you received:`,
        "",
        `💰 **${totalGold} Gold**`,
        "",
        `**${burnedCount} card${burnedCount !== 1 ? "s have" : " has"} been burned.**`
      ].join("\n")
    )
    .setColor(0x57f287); // green

  await interaction.update({
    content: null,
    embeds: [embed],
    components: []
  });
}

export async function handleMultiBurnCancelButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const sessionId = parts[2];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  deleteMultiBurnSession(sessionId);

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
    content: null,
    embeds: [embed],
    components: []
  });
}

export async function handleMultiBurnPageButton(interaction: ButtonInteraction) {
  // customId format: multiburn_page:<userId>:<sessionId>:<page>:<direction>
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const sessionId = parts[2];
  const page = Number(parts[3]);

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your burn confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const session = getMultiBurnSession(sessionId);
  if (!session) {
    await interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("Burn Cards")
          .setDescription("This burn session has expired. Please try again.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  const view = buildMultiBurnView(ownerId, sessionId, session.cards, page);

  await interaction.update({
    embeds: [view.embed],
    components: view.components
  });
}
