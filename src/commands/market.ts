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
import {
  getMarketSlot,
  getMarketCardsForSlot,
  getTimeUntilRefresh,
  getMarketPage,
  getOrBuildMarketCollage,
  MARKET_TOTAL_PAGES,
  type MarketCardEntry
} from "../services/marketService.js";

export const MARKET_BUTTON_PREFIX = "market_page";

export function buildMarketEmbed(
  pageCards: MarketCardEntry[],
  page: number,
  nextRefreshAt: Date,
  collage: Buffer
) {
  const { minutes, seconds } = getTimeUntilRefresh(nextRefreshAt);
  const refreshText =
    minutes > 0
      ? `Next refresh in **${minutes}** minute${minutes !== 1 ? "s" : ""}`
      : `Next refresh in **${seconds}** second${seconds !== 1 ? "s" : ""}`;

  const listLines = pageCards
    .map((e) => `💎 **${e.id}** — ${e.card.name} — **${e.priceGold.toLocaleString()}** Gold`)
    .join("\n");

  const attachment = new AttachmentBuilder(collage, { name: "market.webp" });

  const embed = new EmbedBuilder()
    .setTitle("Black Market")
    .setDescription(`${listLines}\n\n${refreshText}`)
    .setColor(0x2b2d31)
    .setFooter({ text: `Page ${page} of ${MARKET_TOTAL_PAGES}` })
    .setImage("attachment://market.webp");

  return { embed, attachment };
}

export function buildMarketButtons(page: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MARKET_BUTTON_PREFIX}:${page - 1}`)
      .setLabel("⬅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${MARKET_BUTTON_PREFIX}:${page + 1}`)
      .setLabel("➡")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= MARKET_TOTAL_PAGES)
  );
}

export const marketCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("market")
    .setDescription("View the current Black Market listings (12 cards, refreshes every 3 hours)."),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const { slotIndex, nextRefreshAt } = getMarketSlot();
      const allCards = await getMarketCardsForSlot(slotIndex);

      if (allCards.length === 0) {
        await interaction.editReply({
          content: "The market has no listings right now. Try again after the next refresh."
        });
        return;
      }

      const page = 1;
      const pageCards = getMarketPage(allCards, page);
      const collage = await getOrBuildMarketCollage(
        slotIndex,
        page,
        pageCards.map((c) => c.card),
        pageCards.map((c) => c.id)
      );

      const { embed, attachment } = buildMarketEmbed(pageCards, page, nextRefreshAt, collage);

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [buildMarketButtons(page)]
      });
    } catch (error) {
      console.error("[MARKET]", error);
      await interaction.editReply({
        content: `Market failed: ${(error as Error).message}`
      });
    }
  }
};
