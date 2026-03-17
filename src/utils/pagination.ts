import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

/**
 * Build the standard 4-button pagination row (⏮ ⬅ ➡ ⏭).
 *
 * Each button's customId is: `${prefix}:${params}:${targetPage}:${suffix}`
 * where suffix is one of "first", "prev", "next", "last".
 *
 * @param prefix   The button customId prefix (e.g. "multiburn_page")
 * @param params   Middle segment(s) of the customId (e.g. `${userId}` or `${userId}:${sessionId}`)
 * @param page     Current page (1-based)
 * @param totalPages  Total number of pages
 */
export function buildPaginationRow(
  prefix: string,
  params: string,
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:${params}:1:first`)
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}:${params}:${page - 1}:prev`)
      .setLabel("⬅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}:${params}:${page + 1}:next`)
      .setLabel("➡")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`${prefix}:${params}:${totalPages}:last`)
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
}
