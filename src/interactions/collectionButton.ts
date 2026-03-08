import type { ButtonInteraction } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import { COLLECTION_BUTTON_PREFIX, COLLECTION_EXPORT_PREFIX, buildCollectionView } from "../commands/collection.js";
import type { CollectionSort } from "../repositories/collectionRepo.js";
import { getAllForExport, formatCollectionAsMoxfield } from "../repositories/collectionRepo.js";

export async function handleCollectionPageButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const prefix = parts[0];

  if (prefix === COLLECTION_EXPORT_PREFIX) {
    const targetUserId = parts[1];
    if (!targetUserId || interaction.user.id !== targetUserId) {
      await interaction.reply({ content: "You can only export your own collection.", ephemeral: true }).catch(() => {});
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const entries = await getAllForExport(targetUserId);
    const text = formatCollectionAsMoxfield(entries);
    const buffer = Buffer.from(text || "No cards in collection.", "utf-8");
    const attachment = new AttachmentBuilder(buffer, { name: "collection-moxfield.txt" });
    await interaction.editReply({
      content: "Here’s your collection in Moxfield format. You can import this into Moxfield.",
      files: [attachment]
    });
    return;
  }

  if (prefix !== COLLECTION_BUTTON_PREFIX) {
    return;
  }

  await interaction.deferUpdate();

  const targetUserId = parts[1];
  const pageRaw = parts[2];
  const sort = (parts[3] ?? "recent") as CollectionSort;
  const viewMode = (parts[4] ?? "list") as "list" | "album";
  const tagName = parts[5]?.trim() || undefined;

  const nextPage = Number(pageRaw);
  if (!targetUserId || !Number.isInteger(nextPage) || nextPage < 1) {
    await interaction.followUp({ content: "Invalid collection pagination.", flags: 64 }).catch(() => {});
    return;
  }

  const user = await interaction.client.users.fetch(targetUserId);
  const view = await buildCollectionView(user, nextPage, sort, viewMode, interaction.user.id, tagName ?? null);
  if (!view) {
    await interaction.followUp({ content: "Tag no longer exists.", flags: 64 }).catch(() => {});
    return;
  }
  if (view.file) {
    await interaction.editReply({
      content: view.content ?? undefined,
      embeds: view.embed ? [view.embed] : [],
      files: [{ attachment: view.file.buffer, name: view.file.name }],
      components: view.components
    });
  } else {
    await interaction.editReply({
      embeds: view.embed ? [view.embed] : [],
      components: view.components
    });
  }
}
