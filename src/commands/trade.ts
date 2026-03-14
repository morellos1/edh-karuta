import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { buildTradePairImage } from "../services/collageService.js";
import { TRADE_ACCEPT_PREFIX, TRADE_DECLINE_PREFIX } from "../interactions/tradeGiveButton.js";
import { conditionToStars, resolveBasePrice } from "../utils/cardFormatting.js";

export const tradeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Offer a 1-for-1 trade to another user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Who you want to trade with").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("mycardid").setDescription("Your offered card ID").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("theircardid").setDescription("Their requested card ID").setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("user", true);
    const myCardId = interaction.options.getString("mycardid", true).trim();
    const theirCardId = interaction.options.getString("theircardid", true).trim();

    if (target.bot) {
      await interaction.editReply({ content: "You cannot trade with bots." });
      return;
    }
    if (target.id === interaction.user.id) {
      await interaction.editReply({ content: "You cannot trade with yourself." });
      return;
    }
    if (myCardId === theirCardId) {
      await interaction.editReply({ content: "Your card ID and their card ID must be different." });
      return;
    }

    const myCard = await getUserCardByDisplayId(myCardId);
    if (!myCard || myCard.userId !== interaction.user.id) {
      await interaction.editReply({
        content: "Your offered card ID is invalid, or that card is not in your collection."
      });
      return;
    }

    const theirCard = await getUserCardByDisplayId(theirCardId);
    if (!theirCard || theirCard.userId !== target.id) {
      await interaction.editReply({
        content: "The requested card ID is invalid, or that card is not owned by the tagged user."
      });
      return;
    }

    const [baseUsdMy, baseUsdTheir] = await Promise.all([
      resolveBasePrice(myCard.card.usdPrice, myCard.card.name, myCard.card.eurPrice),
      resolveBasePrice(theirCard.card.usdPrice, theirCard.card.name, theirCard.card.eurPrice)
    ]);
    const myGold = getGoldValue(String(baseUsdMy), myCard.condition);
    const theirGold = getGoldValue(String(baseUsdTheir), theirCard.condition);
    const myStars = conditionToStars(myCard.condition);
    const theirStars = conditionToStars(theirCard.condition);

    const collage = await buildTradePairImage(myCard.card, theirCard.card);
    const attachment = new AttachmentBuilder(collage, { name: "trade.webp" });

    const embed = new EmbedBuilder()
      .setTitle("Card Trade")
      .setDescription(
        `<@${interaction.user.id}>\n\`${myCard.displayId}\` · \`${myStars}\` · \`💰 ${myGold} Gold\` · **${myCard.card.name}**`
      )
      .addFields({
        name: "\u200b",
        value: `<@${target.id}>\n\`${theirCard.displayId}\` · \`${theirStars}\` · \`💰 ${theirGold} Gold\` · **${theirCard.card.name}**`,
        inline: false
      })
      .setImage("attachment://trade.webp")
      .setColor(0x808080);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `${TRADE_DECLINE_PREFIX}:${interaction.user.id}:${target.id}:${myCard.displayId}:${theirCard.displayId}`
        )
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(
          `${TRADE_ACCEPT_PREFIX}:${interaction.user.id}:${target.id}:${myCard.displayId}:${theirCard.displayId}`
        )
        .setEmoji("✅")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
      components: [row]
    });
  }
};
