import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import {
  createMultiTagSession,
  buildMultiTagView,
  type MultiTagCard
} from "../services/multiTagStore.js";

export const multitagCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("multitag")
    .setDescription("Tag multiple cards into a tag at once.")
    .addStringOption((opt) =>
      opt.setName("tagname").setDescription("Name of the tag").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("cardids").setDescription("Space-separated card IDs (e.g. ABCDEF GHIJKL MNOPQR)").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const tagname = interaction.options.getString("tagname", true).trim();
    const cardIdsRaw = interaction.options.getString("cardids", true).trim();
    const cardIds = cardIdsRaw.split(/\s+/).filter(Boolean);

    if (cardIds.length === 0) {
      await interaction.reply({ content: "Please provide at least one card ID.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    // Resolve display IDs to user card records
    const cards: MultiTagCard[] = [];
    const notFound: string[] = [];
    const notOwned: string[] = [];

    for (const displayId of cardIds) {
      const userCard = await getUserCardByDisplayId(displayId);
      if (!userCard) {
        notFound.push(displayId);
      } else if (userCard.userId !== userId) {
        notOwned.push(displayId);
      } else {
        if (!cards.some((c) => c.userCardId === userCard.id)) {
          cards.push({ userCardId: userCard.id, displayId: userCard.displayId, name: userCard.card.name });
        }
      }
    }

    if (cards.length === 0) {
      const lines: string[] = [];
      if (notFound.length > 0) lines.push(`Not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`);
      if (notOwned.length > 0) lines.push(`Not yours: ${notOwned.map((id) => `\`${id}\``).join(", ")}`);
      await interaction.editReply({ content: lines.join("\n") || "No valid cards provided." });
      return;
    }

    const sessionId = createMultiTagSession(userId, tagname, cards);
    const view = buildMultiTagView(userId, sessionId, tagname, cards, 1);

    const errorLines: string[] = [];
    if (notFound.length > 0) errorLines.push(`Not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`);
    if (notOwned.length > 0) errorLines.push(`Not yours: ${notOwned.map((id) => `\`${id}\``).join(", ")}`);
    const errorPrefix = errorLines.length > 0 ? errorLines.join("\n") : undefined;

    await interaction.editReply({
      content: errorPrefix,
      embeds: [view.embed],
      components: view.components
    });
  }
};
