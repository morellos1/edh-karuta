import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId, getLastCollectedCard } from "../repositories/userCardRepo.js";
import { addCardToTag } from "../repositories/tagRepo.js";

export const tagCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Tag a card you own. Omit card ID to tag your last collected card.")
    .addStringOption((opt) =>
      opt.setName("tagname").setDescription("Name of the tag").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("cardid").setDescription("6-character card ID (omit to tag last collected)").setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const tagname = interaction.options.getString("tagname", true).trim();
    const cardIdArg = interaction.options.getString("cardid", false)?.trim();

    let userCard = cardIdArg
      ? await getUserCardByDisplayId(cardIdArg)
      : await getLastCollectedCard(userId);

    if (!userCard) {
      await interaction.reply({
        content: cardIdArg ? "No card in your collection with that ID." : "You have no cards to tag.",
        ephemeral: true
      });
      return;
    }
    if (userCard.userId !== userId) {
      await interaction.reply({
        content: "You can only tag your own cards.",
        ephemeral: true
      });
      return;
    }

    const result = await addCardToTag(userId, userCard.id, tagname);
    if (!result.ok) {
      await interaction.reply({
        content: result.reason === "tag_not_found"
          ? `You don't have a tag named **${tagname}**. Create it with \`/tagcreate\`.`
          : "You can only tag your own cards.",
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      content: `Tagged **${userCard.card.name}** (\`${userCard.displayId}\`) with **${tagname}**.`,
      ephemeral: false
    });
  }
};
