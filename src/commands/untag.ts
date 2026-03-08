import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { removeCardFromTag, removeAllTagsFromCard } from "../repositories/tagRepo.js";

export const untagCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("untag")
    .setDescription("Remove a tag from a card, or remove all tags from a card.")
    .addStringOption((opt) =>
      opt.setName("cardid").setDescription("6-character card ID").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("tagname").setDescription("Tag to remove (omit to remove all tags from the card)").setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const cardIdArg = interaction.options.getString("cardid", true).trim();
    const tagname = interaction.options.getString("tagname", false)?.trim();

    const userCard = await getUserCardByDisplayId(cardIdArg);
    if (!userCard || userCard.userId !== userId) {
      await interaction.reply({
        content: "No card in your collection with that ID.",
        ephemeral: true
      });
      return;
    }

    if (tagname != null && tagname !== "") {
      const result = await removeCardFromTag(userId, userCard.id, tagname);
      if (!result.ok) {
        await interaction.reply({
          content: result.reason === "tag_not_found"
            ? `You don't have a tag named **${tagname}**.`
            : "Could not remove tag.",
          ephemeral: true
        });
        return;
      }
      await interaction.reply({
        content: `Removed **${tagname}** from **${userCard.card.name}** (\`${userCard.displayId}\`).`,
        ephemeral: false
      });
    } else {
      await removeAllTagsFromCard(userId, userCard.id);
      await interaction.reply({
        content: `Removed all tags from **${userCard.card.name}** (\`${userCard.displayId}\`).`,
        ephemeral: false
      });
    }
  }
};
