import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  User,
  type APIEmbed
} from "discord.js";
import { getCollectionPage } from "../repositories/collectionRepo.js";
import type { CollectionSort } from "../repositories/collectionRepo.js";
import { getTagIdForUser } from "../repositories/tagRepo.js";
import { getCheapestPrintPricesByNames, getDefaultBasePriceUsd } from "../repositories/cardRepo.js";
import { getGold } from "../repositories/inventoryRepo.js";
import type { SlashCommand } from "./types.js";
import { formatColorCollectionLine } from "../utils/cardFormatting.js";
import { getConditionMultiplier } from "../services/conditionService.js";
import { buildCollectionGrid } from "../services/collageService.js";

export const COLLECTION_BUTTON_PREFIX = "collection_page";
export const COLLECTION_EXPORT_PREFIX = "collection_export";
const GOLD_MAX_DIGITS = 7; // 9999999g max -> 8 chars total
const GOLD_PAD_WIDTH = GOLD_MAX_DIGITS + 1; // 8

export type CollectionViewMode = "list" | "album";

function conditionToStars(condition: string | null | undefined): string {
  const c = (condition ?? "good").toLowerCase();
  if (c === "poor") return "★☆☆";
  if (c === "mint") return "★★★";
  return "★★☆"; // good or fallback
}

function formatGoldShort(baseUsd: number, condition: string | null | undefined): string {
  const mult = getConditionMultiplier(condition);
  const gold = Math.round(baseUsd * 100 * mult);
  const s = `${gold}g`;
  return s.padStart(GOLD_PAD_WIDTH, " ");
}

export async function buildCollectionView(
  user: User,
  page: number,
  sort: CollectionSort = "recent",
  viewMode: CollectionViewMode = "list",
  viewerId?: string,
  tagName?: string | null
): Promise<{
  embed?: APIEmbed;
  content?: string;
  components: ActionRowBuilder<ButtonBuilder>[];
  file?: { buffer: Buffer; name: string };
} | null> {
  const pageSize = viewMode === "album" ? 8 : 10;
  const tagId = tagName != null && tagName.trim() ? await getTagIdForUser(user.id, tagName) : null;
  if (tagName != null && tagName.trim() && tagId == null) {
    return null;
  }
  const result = await getCollectionPage(user.id, page, sort, pageSize, tagId ?? undefined);
  const goldBalance = await getGold(user.id);
  const titleSuffix = tagId != null ? ` · ${tagName?.trim()}` : "";
  const pageInfo = `Page ${result.page}/${result.totalPages} | Total: ${result.total}`;
  const tagParam = tagName != null && tagName.trim() ? tagName.trim() : "";

  if (viewMode === "album") {
    const gridBuffer = await buildCollectionGrid(result.cards.map((e) => e.card));
    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Collection${titleSuffix}`)
      .setImage("attachment://collection-grid.webp")
      .setFooter({
        text: `💰 ${goldBalance} Gold · Album · ${pageInfo}`
      });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:1:${sort}:album:${tagParam}:first`)
        .setLabel("⏮")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(result.page <= 1),
      new ButtonBuilder()
        .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:${result.page - 1}:${sort}:album:${tagParam}:prev`)
        .setLabel("⬅")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(result.page <= 1),
      new ButtonBuilder()
        .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:${result.page + 1}:${sort}:album:${tagParam}:next`)
        .setLabel("➡")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(result.page >= result.totalPages),
      new ButtonBuilder()
        .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:${result.totalPages}:${sort}:album:${tagParam}:last`)
        .setLabel("⏭")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(result.page >= result.totalPages)
    );
    if (viewerId === user.id) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${COLLECTION_EXPORT_PREFIX}:${user.id}:${tagParam}`)
          .setLabel("Export")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    return {
      content: pageInfo,
      embed: embed.toJSON(),
      components: [row],
      file: { buffer: gridBuffer, name: "collection-grid.webp" }
    };
  }

  const namesNeedingPrice = [
    ...new Set(
      result.cards
        .filter((e) => !e.card.usdPrice || !Number.isFinite(Number(e.card.usdPrice)))
        .map((e) => e.card.name)
    )
  ];
  const priceMap = namesNeedingPrice.length
    ? await getCheapestPrintPricesByNames(namesNeedingPrice)
    : new Map<string, number>();
  const defaultBase = getDefaultBasePriceUsd();

  const description = result.cards.length
    ? result.cards
        .map((entry: (typeof result.cards)[number]) => {
          const baseUsd =
            entry.card.usdPrice != null && Number.isFinite(Number(entry.card.usdPrice))
              ? Number(entry.card.usdPrice)
              : (priceMap.get(entry.card.name) ?? defaultBase);
          const stars = conditionToStars(entry.condition);
          const gold = formatGoldShort(baseUsd, entry.condition);
          if (sort === "color") {
            const colors = formatColorCollectionLine(entry.card.colors);
            return `\`${colors}\`  · \`${entry.displayId}\` · \`${stars}\` · \`${gold}\` · **${entry.card.name}**`;
          }
          return `\`${entry.displayId}\` · \`${stars}\` · \`${gold}\` · **${entry.card.name}**`;
        })
        .join("\n")
    : "No cards collected yet.";

  const sortLabelStr = sortLabel(sort);
  const embed = new EmbedBuilder()
    .setTitle(`${user.username}'s Collection${titleSuffix}`)
    .setDescription(description)
    .setFooter({
      text: `💰 ${goldBalance} Gold · Sort: ${sortLabelStr} | Page ${result.page}/${result.totalPages} | Total: ${result.total}`
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:1:${sort}:list:${tagParam}:first`)
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(result.page <= 1),
    new ButtonBuilder()
      .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:${result.page - 1}:${sort}:list:${tagParam}:prev`)
      .setLabel("⬅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(result.page <= 1),
    new ButtonBuilder()
      .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:${result.page + 1}:${sort}:list:${tagParam}:next`)
      .setLabel("➡")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(result.page >= result.totalPages),
    new ButtonBuilder()
      .setCustomId(`${COLLECTION_BUTTON_PREFIX}:${user.id}:${result.totalPages}:${sort}:list:${tagParam}:last`)
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(result.page >= result.totalPages)
  );
  if (viewerId === user.id) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${COLLECTION_EXPORT_PREFIX}:${user.id}:${tagParam}`)
        .setLabel("Export")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return {
    embed: embed.toJSON(),
    components: [row]
  };
}

function sortLabel(sort: CollectionSort): string {
  return sort === "recent"
    ? "Recent"
    : sort === "price_asc"
      ? "Price ↑"
      : sort === "price_desc"
        ? "Price ↓"
        : sort === "color"
          ? "Color"
          : "Rarity";
}

export const collectionCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("collection")
    .setDescription("View a user's collected cards.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to inspect").setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("sort")
        .setDescription("Sort order")
        .setRequired(false)
        .addChoices(
          { name: "Recent (default)", value: "recent" },
          { name: "Color", value: "color" },
          { name: "Price (low → high)", value: "price_asc" },
          { name: "Price (high → low)", value: "price_desc" },
          { name: "Rarity", value: "rarity" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("view")
        .setDescription("Display mode")
        .setRequired(false)
        .addChoices(
          { name: "List", value: "list" },
          { name: "Album (2×4 grid)", value: "album" }
        )
    )
    .addStringOption((opt) =>
      opt.setName("tag").setDescription("Show only cards with this tag").setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const user = (interaction.options.getUser("user", false) ?? interaction.user) as User;
    const page = 1;
    const sort = (interaction.options.getString("sort", false) ?? "recent") as CollectionSort;
    const viewMode = (interaction.options.getString("view", false) ?? "list") as CollectionViewMode;
    const tagName = interaction.options.getString("tag", false)?.trim() ?? null;

    if (viewMode === "album") {
      await interaction.deferReply();
    }

    const view = await buildCollectionView(user, page, sort, viewMode, interaction.user.id, tagName);
    if (view == null) {
      const msg = "Tag not found. Use `/tags` to list your tags.";
      if (interaction.deferred) {
        await interaction.editReply({ content: msg }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
      return;
    }

    if (viewMode === "album" && view.file) {
      const payload = {
        content: view.content ?? undefined,
        embeds: view.embed ? [view.embed] : [],
        files: [{ attachment: view.file.buffer, name: view.file.name }],
        components: view.components
      };
      if (interaction.deferred) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: false });
      }
    } else {
      const payload = {
        embeds: view.embed ? [view.embed] : [],
        components: view.components
      };
      if (interaction.deferred) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: false });
      }
    }
  }
};
