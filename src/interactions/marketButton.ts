import type { ButtonInteraction } from "discord.js";
import { MARKET_BUTTON_PREFIX, buildMarketEmbed, buildMarketButtons } from "../commands/market.js";
import {
  getMarketSlot,
  getMarketCardsForSlot,
  getMarketPage,
  getOrBuildMarketCollage,
  MARKET_TOTAL_PAGES
} from "../services/marketService.js";

export async function handleMarketPageButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  if (parts[0] !== MARKET_BUTTON_PREFIX) return;

  await interaction.deferUpdate();

  const page = Number(parts[1]);
  if (!Number.isInteger(page) || page < 1 || page > MARKET_TOTAL_PAGES) {
    await interaction.followUp({ content: "Invalid market page.", flags: 64 }).catch(() => {});
    return;
  }

  const { slotIndex, nextRefreshAt } = getMarketSlot();
  const allCards = await getMarketCardsForSlot(slotIndex);
  const pageCards = getMarketPage(allCards, page);

  if (pageCards.length === 0) {
    await interaction.followUp({ content: "No cards on this page.", flags: 64 }).catch(() => {});
    return;
  }

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
}
