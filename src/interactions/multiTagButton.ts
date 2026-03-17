import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { addCardsToTag } from "../repositories/tagRepo.js";
import {
  getMultiTagSession,
  deleteMultiTagSession,
  buildMultiTagView,
  MULTITAG_CONFIRM_PREFIX,
  MULTITAG_CANCEL_PREFIX,
  MULTITAG_PAGE_PREFIX
} from "../services/multiTagStore.js";

export { MULTITAG_CONFIRM_PREFIX, MULTITAG_CANCEL_PREFIX, MULTITAG_PAGE_PREFIX };

export async function handleMultiTagConfirmButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const sessionId = parts[2];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your tag confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const session = getMultiTagSession(sessionId);
  if (!session) {
    await interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("Tag Cards")
          .setDescription("This tag session has expired. Please try again.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  const result = await addCardsToTag(
    session.userId,
    session.cards.map((c) => c.userCardId),
    session.tagName
  );

  deleteMultiTagSession(sessionId);

  if (!result.ok) {
    await interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("Tag Cards")
          .setDescription(`You don't have a tag named **${session.tagName}**. Create it with \`/tagcreate\`.`)
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Tag Cards")
    .setDescription(
      [
        `<@${ownerId}>`,
        "",
        `🏷️ **${session.cards.length} card${session.cards.length !== 1 ? "s" : ""} tagged with ${session.tagName}.**`
      ].join("\n")
    )
    .setColor(0x57f287); // green

  await interaction.update({
    content: null,
    embeds: [embed],
    components: []
  });
}

export async function handleMultiTagCancelButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const sessionId = parts[2];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your tag confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  deleteMultiTagSession(sessionId);

  const embed = new EmbedBuilder()
    .setTitle("Tag Cards")
    .setDescription(
      [
        `<@${ownerId}>`,
        "",
        `**Tagging has been canceled.**`
      ].join("\n")
    )
    .setColor(0xed4245); // red

  await interaction.update({
    content: null,
    embeds: [embed],
    components: []
  });
}

export async function handleMultiTagPageButton(interaction: ButtonInteraction) {
  // customId format: multitag_page:<userId>:<sessionId>:<page>:<direction>
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const sessionId = parts[2];
  const page = Number(parts[3]);

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your tag confirmation.", ephemeral: true }).catch(() => {});
    return;
  }

  const session = getMultiTagSession(sessionId);
  if (!session) {
    await interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("Tag Cards")
          .setDescription("This tag session has expired. Please try again.")
          .setColor(0xed4245)
      ],
      components: []
    });
    return;
  }

  const view = buildMultiTagView(ownerId, sessionId, session.tagName, session.cards, page);

  await interaction.update({
    embeds: [view.embed],
    components: view.components
  });
}
