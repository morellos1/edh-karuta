import type { ButtonInteraction } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import { COLLECTION_BUTTON_PREFIX, COLLECTION_EXPORT_PREFIX, COLLECTION_COPYIDS_PREFIX, buildCollectionView } from "../commands/collection.js";
import type { CollectionSort } from "../repositories/collectionRepo.js";
import { getAllForExport, getAllCardsByTag, formatCollectionAsMoxfield, getCollectionPage } from "../repositories/collectionRepo.js";
import { getTagIdForUser } from "../repositories/tagRepo.js";

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
    const tagName = parts[2]?.trim() || undefined;
    let entries;
    if (tagName) {
      const tagId = await getTagIdForUser(targetUserId, tagName);
      entries = tagId != null ? await getAllCardsByTag(targetUserId, tagId) : [];
    } else {
      entries = await getAllForExport(targetUserId);
    }
    const text = formatCollectionAsMoxfield(entries);
    const buffer = Buffer.from(text || "No cards in collection.", "utf-8");
    const attachment = new AttachmentBuilder(buffer, { name: "collection-moxfield.txt" });
    await interaction.editReply({
      content: "Here’s your collection in Moxfield format. You can import this into Moxfield.",
      files: [attachment]
    });
    return;
  }

  if (prefix === COLLECTION_COPYIDS_PREFIX) {
    const targetUserId = parts[1];
    if (!targetUserId || interaction.user.id !== targetUserId) {
      await interaction.reply({ content: "You can only copy IDs from your own collection.", ephemeral: true }).catch(() => {});
      return;
    }
    const cpPage = Number(parts[2]);
    const cpSort = (parts[3] ?? "recent") as CollectionSort;
    const cpViewMode = (parts[4] ?? "list") as "list" | "album" | "combined";
    const cpTag = parts[5]?.trim() || undefined;
    const cpSearch = parts[6]?.trim() || undefined;
    const cpType = parts[7]?.trim() || undefined;
    const pageSize = (cpViewMode === "album" || cpViewMode === "combined") ? 8 : 10;
    const tagId = cpTag ? await getTagIdForUser(targetUserId, cpTag) : undefined;
    const result = await getCollectionPage(targetUserId, cpPage, cpSort, pageSize, tagId ?? undefined, cpSearch, cpType);
    const ids = result.cards.map((e) => e.displayId).join(" ") + " ";
    await interaction.reply({ content: `\`\`\`\n${ids}\n\`\`\``, ephemeral: true }).catch(() => {});
    return;
  }

  if (prefix !== COLLECTION_BUTTON_PREFIX) {
    return;
  }

  await interaction.deferUpdate();

  // customId format: collection_page:<userId>:<sort>:<viewMode>:<tag>:<search>:<type>:<page>:<direction>
  const targetUserId = parts[1];
  const sort = (parts[2] ?? "recent") as CollectionSort;
  const viewMode = (parts[3] ?? "list") as "list" | "album" | "combined";
  const tagName = parts[4]?.trim() || undefined;
  const nameSearch = parts[5]?.trim() || undefined;
  const typeFilterParam = parts[6]?.trim() || undefined;
  const pageRaw = parts[7];

  const nextPage = Number(pageRaw);
  if (!targetUserId || !Number.isInteger(nextPage) || nextPage < 1) {
    await interaction.followUp({ content: "Invalid collection pagination.", flags: 64 }).catch(() => {});
    return;
  }

  const user = await interaction.client.users.fetch(targetUserId);
  const view = await buildCollectionView(user, nextPage, sort, viewMode, interaction.user.id, tagName ?? null, nameSearch ?? null, typeFilterParam ?? null);
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
