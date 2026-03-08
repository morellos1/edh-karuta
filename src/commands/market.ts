import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import type { SlashCommand } from "./types.js";
import {
  getMarketSlot,
  getMarketCardsForSlot,
  getTimeUntilRefresh
} from "../services/marketService.js";
import { buildMarketGrid } from "../services/collageService.js";

export const marketCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("market")
    .setDescription("View the current Black Market listings (6 cards, refreshes every 3 hours)."),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const { slotIndex, nextRefreshAt } = getMarketSlot();
    const cards = await getMarketCardsForSlot(slotIndex);

    if (cards.length === 0) {
      await interaction.editReply({
        content: "The market has no listings right now. Try again after the next refresh."
      });
      return;
    }

    const { minutes, seconds } = getTimeUntilRefresh(nextRefreshAt);
    const refreshText =
      minutes > 0
        ? `Next refresh in **${minutes}** minute${minutes !== 1 ? "s" : ""}`
        : `Next refresh in **${seconds}** second${seconds !== 1 ? "s" : ""}`;

    const listLines = cards.map((e) => `💎 **${e.id}** — ${e.card.name} — **${e.priceGold}** Gold`).join("\n");
    const collage = await buildMarketGrid(
      cards.map((c) => c.card),
      cards.map((c) => c.id)
    );
    const attachment = new AttachmentBuilder(collage, { name: "market.webp" });

    const headerEmbed = new EmbedBuilder()
      .setTitle("Black Market")
      .setDescription(`${listLines}\n\n${refreshText}`)
      .setColor(0x2b2d31)
      .setImage("attachment://market.webp");

    await interaction.editReply({
      embeds: [headerEmbed],
      files: [attachment]
    });
  }
};
