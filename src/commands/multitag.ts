import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { addCardsToTag } from "../repositories/tagRepo.js";

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

    // Resolve display IDs to user card records
    const resolved: { id: number; displayId: string; name: string }[] = [];
    const notFound: string[] = [];
    const notOwned: string[] = [];

    for (const displayId of cardIds) {
      const userCard = await getUserCardByDisplayId(displayId);
      if (!userCard) {
        notFound.push(displayId);
      } else if (userCard.userId !== userId) {
        notOwned.push(displayId);
      } else {
        resolved.push({ id: userCard.id, displayId: userCard.displayId, name: userCard.card.name });
      }
    }

    if (resolved.length === 0) {
      const lines: string[] = [];
      if (notFound.length > 0) lines.push(`Not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`);
      if (notOwned.length > 0) lines.push(`Not yours: ${notOwned.map((id) => `\`${id}\``).join(", ")}`);
      await interaction.reply({ content: lines.join("\n") || "No valid cards provided.", ephemeral: true });
      return;
    }

    const result = await addCardsToTag(userId, resolved.map((r) => r.id), tagname);

    if (!result.ok) {
      await interaction.reply({
        content: `You don't have a tag named **${tagname}**. Create it with \`/tagcreate\`.`,
        ephemeral: true
      });
      return;
    }

    const taggedLines = resolved.map((r) => `**${r.name}** (\`${r.displayId}\`)`).join(", ");
    const parts: string[] = [`Tagged ${taggedLines} with **${tagname}**.`];
    if (notFound.length > 0) parts.push(`Not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`);
    if (notOwned.length > 0) parts.push(`Not yours: ${notOwned.map((id) => `\`${id}\``).join(", ")}`);

    await interaction.reply({ content: parts.join("\n") });
  }
};
