import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  Message,
  User
} from "discord.js";
import { getGuildSettings } from "../repositories/guildSettingsRepo.js";
import { gameConfig } from "../config.js";
import { getRandomDroppableCards, getRandomLandCards, getRandomCommanderCards, type DropColorSymbol } from "../repositories/cardRepo.js";
import { getDropCooldownRemainingMs, setDropUsed, setLanddropUsed, setCommanderdropUsed, setColordropUsed } from "../repositories/botConfigRepo.js";
import { buildDropCollage } from "../services/collageService.js";
import { attachDropMessage, createDropRecord } from "../services/dropService.js";
import { buildDropComponents, scheduleDropTimeout } from "../interactions/claimButton.js";
import { buildWishlistNotification } from "../services/wishlistService.js";
import { formatCooldownRemaining } from "../utils/cooldownFormatting.js";
import { createAsyncLock } from "../utils/asyncLock.js";
import { buildCollectionView, type CollectionViewMode } from "../commands/collection.js";
import type { CollectionSort } from "../repositories/collectionRepo.js";
import { getUserCardByDisplayId, getLastCollectedCard } from "../repositories/userCardRepo.js";
import { getGoldValue } from "../services/conditionService.js";
import { getCardImageUrl, resolveBasePrice } from "../utils/cardFormatting.js";
import { BURN_CONFIRM_PREFIX, BURN_CANCEL_PREFIX } from "../commands/burn.js";
import { createMultiBurnSession, buildMultiBurnView, type MultiBurnCard } from "../services/multiBurnStore.js";
import { createMultiTagSession, buildMultiTagView, type MultiTagCard } from "../services/multiTagStore.js";
import {
  getMarketSlot,
  getMarketCardsForSlot,
  getMarketPage,
  getOrBuildMarketCollage,
  MARKET_IDS,
  type MarketCardId
} from "../services/marketService.js";
import { getGold } from "../repositories/inventoryRepo.js";
import { generateDisplayId } from "../utils/displayId.js";
import { prisma } from "../db.js";
import { buildMarketEmbed, buildMarketButtons } from "../commands/market.js";
import { buildToolshopEmbed } from "../commands/toolshop.js";
import { isCommanderEligible } from "../services/clashService.js";
import { rollClashBonuses } from "../services/clashBonusService.js";
import { grantExtraClaims, getExtraClaimCount } from "../repositories/extraClaimRepo.js";
import { grantExtraCommanderDrops, getExtraCommanderDropCount } from "../repositories/extraCommanderDropRepo.js";
import { consumeExtraCommanderDropTx } from "../repositories/extraCommanderDropRepo.js";
import { grantExtraLandDrops, getExtraLandDropCount } from "../repositories/extraLandDropRepo.js";
import { consumeExtraLandDropTx } from "../repositories/extraLandDropRepo.js";
import { getRemainingCooldownMs } from "../services/cooldownService.js";
import {
  getDropCooldownRemainingMs as getDropCdMs,
  getCommanderdropCooldownRemainingMs,
  getColordropCooldownRemainingMs,
  getLanddropCooldownRemainingMs
} from "../repositories/botConfigRepo.js";
import { addCardToTag, isCardInFavoriteTag, getFavoriteCardIds, setTagFavorite } from "../repositories/tagRepo.js";
import { GIVE_ACCEPT_PREFIX, GIVE_DECLINE_PREFIX } from "../interactions/tradeGiveButton.js";
import { conditionToStars } from "../utils/cardFormatting.js";
import {
  formatConditionLabel,
  formatConditionPrice
} from "../services/conditionService.js";
import { findCardByQuery } from "../repositories/cardRepo.js";
import {
  addWishlistEntry,
  getUserWishlistCount,
  wishlistEntryExists,
  removeWishlistEntry
} from "../repositories/wishlistRepo.js";
import {
  EmbedBuilder,
  ButtonStyle
} from "discord.js";
import { buildClashStats, isLegendaryCreature } from "../services/clashService.js";
import { buildStatsEmbed, buildChallengeEmbed } from "../utils/clashFormatting.js";
import { CLASH_ACCEPT_PREFIX, CLASH_DECLINE_PREFIX } from "../commands/clash.js";
import { DAILYRAID_CHALLENGE_PREFIX, DAILYRAID_RUN_PREFIX } from "../commands/dailyraid.js";
import { getDailyBoss } from "../services/dailyRaidService.js";
import { buildDailyRaidEmbed } from "../utils/clashFormatting.js";
import { ENDLESS_CHALLENGE_PREFIX, ENDLESS_CANCEL_PREFIX } from "../commands/endless.js";
import { getCommanderRecord, getBestRecord } from "../services/endlessTowerService.js";

const DROP_SIZE = 3;
const withDropLock = createAsyncLock();
const withLanddropLock = createAsyncLock();
const withCommanderdropLock = createAsyncLock();
const withColordropLock = createAsyncLock();

const COLOR_SYMBOL_MAP: Record<string, DropColorSymbol> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G"
};

const SORT_KEYWORDS: Record<string, CollectionSort> = {
  color: "color",
  white: "color_white",
  blue: "color_blue",
  black: "color_black",
  red: "color_red",
  green: "color_green",
  uncolored: "color_uncolored",
  price: "price_desc",
  rarity: "rarity",
  recent: "recent",
  price_asc: "price_asc",
  price_desc: "price_desc"
};

const VIEW_KEYWORDS: Record<string, CollectionViewMode> = {
  album: "album",
  list: "list",
  combined: "combined"
};

const TYPE_KEYWORDS: Record<string, string> = {
  creature: "Creature",
  artifact: "Artifact",
  enchantment: "Enchantment",
  instant: "Instant",
  sorcery: "Sorcery",
  land: "Land",
  planeswalker: "Planeswalker",
  commander: "Commander"
};

interface ParsedShortcut {
  command: string;
  args: string[];
}

function parseShortcut(content: string, prefix: string): ParsedShortcut | null {
  const trimmed = content.trim();
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return null;

  const afterPrefix = trimmed.slice(prefix.length);
  if (!afterPrefix.length) return null;

  // Split into command shortcut and arguments
  const parts = afterPrefix.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args };
}

export async function handleShortcut(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guildId) return;

  const settings = await getGuildSettings(message.guildId);
  if (!settings.shortcutsEnabled) return;

  const parsed = parseShortcut(message.content, settings.prefix);
  if (!parsed) return;

  const prefix = settings.prefix;

  switch (parsed.command) {
    case "d":
      await handleDrop(message);
      break;
    case "ld":
      await handleLanddrop(message);
      break;
    case "cmd":
      await handleCommanderdrop(message);
      break;
    case "cld":
      await handleColordrop(message, parsed.args, prefix);
      break;
    case "g":
      await handleGive(message, parsed.args, prefix);
      break;
    case "c":
      await handleCollection(message, parsed.args);
      break;
    case "m":
      await handleMarket(message);
      break;
    case "buy": {
      const buyArgsLower = parsed.args.map((a) => a.toLowerCase());
      if (buyArgsLower[0] === "extra" && buyArgsLower[1] === "claim") {
        const qty = parsed.args[2] ? parseInt(parsed.args[2], 10) : 1;
        await handleBuyExtraClaim(message, Number.isFinite(qty) && qty >= 1 ? qty : 1);
      } else if (buyArgsLower[0] === "extra" && (buyArgsLower[1] === "commanderdrop" || buyArgsLower[1] === "cmd")) {
        const qty = parsed.args[2] ? parseInt(parsed.args[2], 10) : 1;
        await handleBuyExtraCommanderDrop(message, Number.isFinite(qty) && qty >= 1 ? qty : 1);
      } else if (buyArgsLower[0] === "extra" && (buyArgsLower[1] === "landdrop" || buyArgsLower[1] === "ld")) {
        const qty = parsed.args[2] ? parseInt(parsed.args[2], 10) : 1;
        await handleBuyExtraLandDrop(message, Number.isFinite(qty) && qty >= 1 ? qty : 1);
      } else {
        await handleBuy(message, parsed.args, prefix);
      }
      break;
    }
    case "ts":
      await handleToolshop(message);
      break;
    case "b":
      await handleBurn(message, parsed.args);
      break;
    case "cd":
      await handleCooldowns(message);
      break;
    case "t":
      await handleTag(message, parsed.args, prefix);
      break;
    case "mt":
      await handleDeck(message, parsed.args, prefix);
      break;
    case "lu":
      await handleLookup(message, parsed.args);
      break;
    case "wa":
      await handleWishadd(message, parsed.args, prefix);
      break;
    case "wr":
      await handleWishremove(message, parsed.args, prefix);
      break;
    case "fav":
      await handleFav(message, parsed.args, prefix);
      break;
    case "unfav":
      await handleUnfav(message, parsed.args, prefix);
      break;
    case "setcmd":
      await handleSetCommander(message, parsed.args, prefix);
      break;
    case "stats":
      await handleStats(message, parsed.args, prefix);
      break;
    case "clash":
      await handleClash(message);
      break;
    case "draid":
      await handleDailyRaid(message);
      break;
    case "endless":
      await handleEndless(message);
      break;
    default:
      // Not a recognized shortcut, ignore
      break;
  }
}

async function handleDrop(message: Message): Promise<void> {
  if (!message.guildId) return;

  if (gameConfig.dropCooldownSeconds > 0) {
    const blocked = await withDropLock(message.author.id, async () => {
      const remainingMs = await getDropCooldownRemainingMs(message.author.id);
      if (remainingMs > 0) {
        await message.reply({
          content: `<@${message.author.id}>, you can drop again ${formatCooldownRemaining(remainingMs)}.`
        });
        return true;
      }
      await setDropUsed(message.author.id);
      return false;
    });
    if (blocked) return;
  }

  try {
    const cards = await getRandomDroppableCards(DROP_SIZE);
    const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
    const drop = await createDropRecord({
      guildId: message.guildId,
      channelId: message.channelId,
      dropperUserId: message.author.id,
      expiresAt,
      cards
    });

    const collage = await buildDropCollage(cards);
    const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
    const components = buildDropComponents(drop);

    const dropLine = `<@${message.author.id}> is dropping 3 cards!`;
    const wishNotification = await buildWishlistNotification(
      message.guildId,
      cards.map((c) => c.name)
    );
    const content = wishNotification
      ? `${wishNotification}\n\n${dropLine}`
      : dropLine;

    const reply = await message.reply({
      content,
      files: [attachment],
      components
    });

    await attachDropMessage(drop.id, reply.id);
    scheduleDropTimeout(message.client, {
      dropId: drop.id,
      channelId: message.channelId,
      messageId: reply.id,
      expiresAt
    });
  } catch (error) {
    await message.reply({ content: `Drop failed: ${(error as Error).message}` }).catch(() => {});
  }
}

async function handleLanddrop(message: Message): Promise<void> {
  if (!message.guildId) return;

  let usedExtraLandDrop: number | null = null;
  const blocked = await withLanddropLock(message.author.id, async () => {
    const remainingMs = await getLanddropCooldownRemainingMs(message.author.id);
    if (remainingMs > 0) {
      const remaining = await prisma.$transaction(async (tx) => {
        return consumeExtraLandDropTx(tx, message.author.id);
      });
      if (remaining === null) {
        await message.reply({
          content: `Land Drop is on cooldown. Try again ${formatCooldownRemaining(remainingMs)}.`
        });
        return true;
      }
      usedExtraLandDrop = remaining;
      return false;
    }
    await setLanddropUsed(message.author.id);
    return false;
  });
  if (blocked) return;

  try {
    const cards = await getRandomLandCards(DROP_SIZE);
    const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
    const drop = await createDropRecord({
      guildId: message.guildId,
      channelId: message.channelId,
      dropperUserId: message.author.id,
      expiresAt,
      cards,
      dropType: "landdrop"
    });

    const collage = await buildDropCollage(cards);
    const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
    const components = buildDropComponents(drop);

    const dropLine = `<@${message.author.id}> is dropping 3 nonbasic land cards!`;
    const wishNotification = await buildWishlistNotification(
      message.guildId,
      cards.map((c) => c.name)
    );
    const content = wishNotification
      ? `${wishNotification}\n\n${dropLine}`
      : dropLine;

    const reply = await message.reply({
      content,
      files: [attachment],
      components
    });

    await attachDropMessage(drop.id, reply.id);
    scheduleDropTimeout(message.client, {
      dropId: drop.id,
      channelId: message.channelId,
      messageId: reply.id,
      expiresAt
    });

    if (usedExtraLandDrop !== null && 'send' in message.channel) {
      await message.channel.send({
        content: `<@${message.author.id}>, your Extra LandDrop has been consumed. You have ${usedExtraLandDrop} remaining.`
      });
    }
  } catch (error) {
    await message.reply({ content: `Land Drop failed: ${(error as Error).message}` }).catch(() => {});
  }
}

async function handleCommanderdrop(message: Message): Promise<void> {
  if (!message.guildId) return;

  let usedExtraCommanderDrop: number | null = null;
  const blocked = await withCommanderdropLock(message.author.id, async () => {
    const remainingMs = await getCommanderdropCooldownRemainingMs(message.author.id);
    if (remainingMs > 0) {
      const remaining = await prisma.$transaction(async (tx) => {
        return consumeExtraCommanderDropTx(tx, message.author.id);
      });
      if (remaining === null) {
        await message.reply({
          content: `Commander Drop is on cooldown. Try again ${formatCooldownRemaining(remainingMs)}.`
        });
        return true;
      }
      usedExtraCommanderDrop = remaining;
      return false;
    }
    await setCommanderdropUsed(message.author.id);
    return false;
  });
  if (blocked) return;

  try {
    const cards = await getRandomCommanderCards(DROP_SIZE);
    const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
    const drop = await createDropRecord({
      guildId: message.guildId,
      channelId: message.channelId,
      dropperUserId: message.author.id,
      expiresAt,
      cards,
      dropType: "commanderdrop"
    });

    const collage = await buildDropCollage(cards);
    const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
    const components = buildDropComponents(drop);

    const dropLine = `<@${message.author.id}> is dropping 3 commander cards!`;
    const wishNotification = await buildWishlistNotification(
      message.guildId,
      cards.map((c) => c.name)
    );
    const content = wishNotification
      ? `${wishNotification}\n\n${dropLine}`
      : dropLine;

    const reply = await message.reply({
      content,
      files: [attachment],
      components
    });

    await attachDropMessage(drop.id, reply.id);
    scheduleDropTimeout(message.client, {
      dropId: drop.id,
      channelId: message.channelId,
      messageId: reply.id,
      expiresAt
    });

    if (usedExtraCommanderDrop !== null && 'send' in message.channel) {
      await message.channel.send({
        content: `<@${message.author.id}>, your Extra CommanderDrop has been consumed. You have ${usedExtraCommanderDrop} remaining.`
      });
    }
  } catch (error) {
    await message.reply({ content: `Commander Drop failed: ${(error as Error).message}` }).catch(() => {});
  }
}

async function handleColordrop(message: Message, args: string[], prefix: string): Promise<void> {
  if (!message.guildId) return;

  const colorArg = args[0]?.toLowerCase();
  if (!colorArg || !(colorArg in COLOR_SYMBOL_MAP)) {
    await message.reply({
      content: `Usage: \`${prefix}cld <white|blue|black|red|green>\``
    });
    return;
  }

  const colorSymbol = COLOR_SYMBOL_MAP[colorArg];

  const blocked = await withColordropLock(message.author.id, async () => {
    const remainingMs = await getColordropCooldownRemainingMs(message.author.id);
    if (remainingMs > 0) {
      await message.reply({
        content: `Color Drop is on cooldown. Try again ${formatCooldownRemaining(remainingMs)}.`
      });
      return true;
    }
    await setColordropUsed(message.author.id);
    return false;
  });
  if (blocked) return;

  try {
    const cards = await getRandomDroppableCards(DROP_SIZE, colorSymbol);
    const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
    const drop = await createDropRecord({
      guildId: message.guildId,
      channelId: message.channelId,
      dropperUserId: message.author.id,
      expiresAt,
      cards,
      dropType: "colordrop"
    });

    const collage = await buildDropCollage(cards);
    const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
    const components = buildDropComponents(drop);

    const dropLine = `<@${message.author.id}> is dropping 3 cards! (${colorArg})`;
    const wishNotification = await buildWishlistNotification(
      message.guildId,
      cards.map((c) => c.name)
    );
    const content = wishNotification
      ? `${wishNotification}\n\n${dropLine}`
      : dropLine;

    const reply = await message.reply({
      content,
      files: [attachment],
      components
    });

    await attachDropMessage(drop.id, reply.id);
    scheduleDropTimeout(message.client, {
      dropId: drop.id,
      channelId: message.channelId,
      messageId: reply.id,
      expiresAt
    });
  } catch (error) {
    await message.reply({ content: `Color Drop failed: ${(error as Error).message}` }).catch(() => {});
  }
}

async function handleGive(message: Message, args: string[], prefix: string): Promise<void> {
  if (args.length < 2) {
    await message.reply({ content: `Usage: \`${prefix}g @user <cardid>\`` });
    return;
  }

  const mentionMatch = args[0].match(/^<@!?(\d+)>$/);
  if (!mentionMatch) {
    await message.reply({ content: `Usage: \`${prefix}g @user <cardid>\`` });
    return;
  }

  let target: User;
  try {
    target = await message.client.users.fetch(mentionMatch[1]);
  } catch {
    await message.reply({ content: "Could not find that user." });
    return;
  }

  if (target.bot) {
    await message.reply({ content: "You cannot give cards to bots." });
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ content: "You cannot give a card to yourself." });
    return;
  }

  const cardId = args[1].trim();
  const myCard = await getUserCardByDisplayId(cardId);
  if (!myCard || myCard.userId !== message.author.id) {
    await message.reply({ content: "Invalid card ID, or that card is not in your collection." });
    return;
  }

  const image = getCardImageUrl(myCard.card);
  const baseUsd = await resolveBasePrice(myCard.card.usdPrice, myCard.card.name, myCard.card.eurPrice);
  const gold = getGoldValue(String(baseUsd), myCard.condition);
  const stars = conditionToStars(myCard.condition);

  const embed = new EmbedBuilder()
    .setTitle("Card Transfer")
    .setDescription(`<@${message.author.id}> → <@${target.id}>`)
    .addFields({
      name: "\u200b",
      value: `\`${myCard.displayId}\` · \`${stars}\` · \`💰 ${gold} Gold\` · **${myCard.card.name}**`,
      inline: false
    })
    .setColor(0x808080);

  if (image) {
    embed.setImage(image);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVE_DECLINE_PREFIX}:${message.author.id}:${target.id}:${myCard.displayId}`)
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${GIVE_ACCEPT_PREFIX}:${message.author.id}:${target.id}:${myCard.displayId}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Secondary)
  );

  await message.reply({
    embeds: [embed],
    components: [row]
  });
}

async function handleCollection(message: Message, args: string[]): Promise<void> {
  let targetUser: User = message.author;
  let sort: CollectionSort = "recent";
  let viewMode: CollectionViewMode = "list";
  let tagName: string | null = null;
  let nameSearch: string | null = null;
  let typeFilter: string | null = null;

  // First pass: find search: / s: and type: prefixed args (which may span multiple args)
  const remaining: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const lower = args[i].toLowerCase();
    if (lower.startsWith("search:") || lower.startsWith("s:")) {
      const prefix = lower.startsWith("search:") ? "search:" : "s:";
      const parts = [args[i].slice(prefix.length)];
      // Consume following args until we hit a known keyword, mention, or another prefix
      for (let j = i + 1; j < args.length; j++) {
        const next = args[j].toLowerCase();
        if (next.match(/^<@!?\d+>$/) || next in SORT_KEYWORDS || next in VIEW_KEYWORDS || next in TYPE_KEYWORDS || next.startsWith("search:") || next.startsWith("s:") || next.startsWith("type:")) {
          break;
        }
        parts.push(args[j]);
        i = j;
      }
      nameSearch = parts.join(" ").trim() || null;
      continue;
    }
    if (lower.startsWith("type:")) {
      const typeVal = args[i].slice("type:".length).trim();
      if (typeVal.toLowerCase() in TYPE_KEYWORDS) {
        typeFilter = TYPE_KEYWORDS[typeVal.toLowerCase()];
      }
      continue;
    }
    remaining.push(args[i]);
  }

  for (const arg of remaining) {
    // Check for user mention
    const mentionMatch = arg.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
      try {
        targetUser = await message.client.users.fetch(mentionMatch[1]);
      } catch {
        // Ignore invalid mention, keep default
      }
      continue;
    }

    // Check for sort keyword
    const sortKey = arg.toLowerCase();
    if (sortKey in SORT_KEYWORDS) {
      sort = SORT_KEYWORDS[sortKey];
      continue;
    }

    // Check for view keyword
    if (sortKey in VIEW_KEYWORDS) {
      viewMode = VIEW_KEYWORDS[sortKey];
      continue;
    }

    // Check for type keyword shorthand (e.g., "kc artifact")
    if (sortKey in TYPE_KEYWORDS) {
      typeFilter = TYPE_KEYWORDS[sortKey];
      continue;
    }

    // Anything else is treated as tag name
    tagName = arg;
  }

  const view = await buildCollectionView(targetUser, 1, sort, viewMode, message.author.id, tagName, nameSearch, typeFilter);
  if (view == null) {
    await message.reply({ content: "Tag not found. Use `/tags` to list your tags." });
    return;
  }

  if ((viewMode === "album" || viewMode === "combined") && view.file) {
    await message.reply({
      content: view.content ?? undefined,
      embeds: view.embed ? [view.embed] : [],
      files: [{ attachment: view.file.buffer, name: view.file.name }],
      components: view.components
    });
  } else {
    await message.reply({
      embeds: view.embed ? [view.embed] : [],
      components: view.components
    });
  }
}

async function handleMarket(message: Message): Promise<void> {
  const { slotIndex, nextRefreshAt } = getMarketSlot();
  const allCards = await getMarketCardsForSlot(slotIndex);

  if (allCards.length === 0) {
    await message.reply({
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

  await message.reply({
    embeds: [embed],
    files: [attachment],
    components: [buildMarketButtons(page)]
  });
}

function parseMarketId(input: string): MarketCardId | null {
  const upper = input.trim().toUpperCase();
  return MARKET_IDS.includes(upper as MarketCardId) ? (upper as MarketCardId) : null;
}

async function handleBuy(message: Message, args: string[], prefix: string): Promise<void> {
  if (!message.guildId) return;

  const idArg = args[0]?.trim();
  if (!idArg) {
    await message.reply({ content: `Usage: \`${prefix}buy <A-L>\`` });
    return;
  }

  const marketId = parseMarketId(idArg);
  if (!marketId) {
    await message.reply({
      content: "Invalid card ID. Use a letter from **A** to **L** as shown in the market."
    });
    return;
  }

  const { slotIndex } = getMarketSlot();
  const cards = await getMarketCardsForSlot(slotIndex);
  const entry = cards.find((e) => e.id === marketId);
  if (!entry) {
    await message.reply({
      content: "That card is not available in the current market."
    });
    return;
  }

  const userId = message.author.id;
  const balance = await getGold(userId);
  if (balance < entry.priceGold) {
    await message.reply({
      content: `You need **${entry.priceGold.toLocaleString()}** gold to buy **${entry.card.name}**, but you only have **${balance.toLocaleString()}** gold.`
    });
    return;
  }

  const botUserId = message.client.user?.id ?? "0";

  try {
    const displayId = await prisma.$transaction(async (tx) => {
      const inv = await tx.userInventory.findUnique({
        where: { userId },
        select: { gold: true }
      });
      if ((inv?.gold ?? 0) < entry.priceGold) {
        throw new Error("insufficient_gold");
      }

      let id = generateDisplayId();
      for (let attempt = 0; attempt < 10; attempt++) {
        const existing = await tx.userCard.findUnique({ where: { displayId: id }, select: { id: true } });
        if (!existing) break;
        id = generateDisplayId();
      }

      const drop = await tx.drop.create({
        data: {
          guildId: message.guildId!,
          channelId: message.channelId,
          dropperUserId: botUserId,
          expiresAt: new Date(0),
          resolvedAt: new Date()
        }
      });
      await tx.dropSlot.create({
        data: {
          dropId: drop.id,
          slotIndex: 0,
          cardId: entry.card.id,
          claimedByUserId: userId,
          claimedAt: new Date()
        }
      });
      const bonuses = isCommanderEligible(entry.card)
        ? rollClashBonuses("mint")
        : {};
      await tx.userCard.create({
        data: {
          displayId: id,
          userId,
          cardId: entry.card.id,
          dropId: drop.id,
          condition: "mint",
          ...bonuses
        }
      });
      await tx.userInventory.upsert({
        where: { userId },
        create: { userId, gold: 0 },
        update: { gold: { increment: -entry.priceGold } }
      });

      return id;
    });

    await message.reply({
      content: `You bought **${entry.card.name}** for **${entry.priceGold.toLocaleString()}** gold. Card ID: \`${displayId}\``
    });
  } catch (err) {
    if ((err as Error).message === "insufficient_gold") {
      await message.reply({ content: "You no longer have enough gold for this purchase." });
    } else {
      await message.reply({ content: `Purchase failed: ${(err as Error).message}` });
    }
  }
}

async function handleToolshop(message: Message): Promise<void> {
  const embed = buildToolshopEmbed();
  await message.reply({ embeds: [embed] });
}

async function handleBuyExtraClaim(message: Message, quantity = 1): Promise<void> {
  const userId = message.author.id;
  const unitPrice = gameConfig.toolshop.extraClaimPrice;
  const totalPrice = unitPrice * quantity;
  const balance = await getGold(userId);

  if (balance < totalPrice) {
    await message.reply({
      content: `You need **${totalPrice.toLocaleString()}** gold to buy **${quantity}** Extra Claim${quantity !== 1 ? "s" : ""}, but you only have **${balance.toLocaleString()}** gold.`
    });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const inv = await tx.userInventory.findUnique({
        where: { userId },
        select: { gold: true }
      });
      if ((inv?.gold ?? 0) < totalPrice) {
        throw new Error("insufficient_gold");
      }
      await tx.userInventory.upsert({
        where: { userId },
        create: { userId, gold: 0 },
        update: { gold: { increment: -totalPrice } }
      });
      await tx.extraClaim.createMany({
        data: Array.from({ length: quantity }, () => ({ userId }))
      });
    });

    const remaining = await getExtraClaimCount(userId);
    await message.reply({
      content: `You bought **${quantity}** Extra Claim${quantity !== 1 ? "s" : ""} for **${totalPrice.toLocaleString()}** gold. You now have **${remaining}** Extra Claim${remaining !== 1 ? "s" : ""}.`
    });
  } catch (err) {
    if ((err as Error).message === "insufficient_gold") {
      await message.reply({ content: "You no longer have enough gold for this purchase." });
    } else {
      await message.reply({ content: `Purchase failed: ${(err as Error).message}` });
    }
  }
}

async function handleBuyExtraCommanderDrop(message: Message, quantity = 1): Promise<void> {
  const userId = message.author.id;
  const unitPrice = gameConfig.toolshop.extraCommanderDropPrice;
  const totalPrice = unitPrice * quantity;
  const balance = await getGold(userId);

  if (balance < totalPrice) {
    await message.reply({
      content: `You need **${totalPrice.toLocaleString()}** gold to buy **${quantity}** Extra CommanderDrop${quantity !== 1 ? "s" : ""}, but you only have **${balance.toLocaleString()}** gold.`
    });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const inv = await tx.userInventory.findUnique({
        where: { userId },
        select: { gold: true }
      });
      if ((inv?.gold ?? 0) < totalPrice) {
        throw new Error("insufficient_gold");
      }
      await tx.userInventory.upsert({
        where: { userId },
        create: { userId, gold: 0 },
        update: { gold: { increment: -totalPrice } }
      });
      await tx.extraCommanderDrop.createMany({
        data: Array.from({ length: quantity }, () => ({ userId }))
      });
    });

    const remaining = await getExtraCommanderDropCount(userId);
    await message.reply({
      content: `You bought **${quantity}** Extra CommanderDrop${quantity !== 1 ? "s" : ""} for **${totalPrice.toLocaleString()}** gold. You now have **${remaining}** Extra CommanderDrop${remaining !== 1 ? "s" : ""}.`
    });
  } catch (err) {
    if ((err as Error).message === "insufficient_gold") {
      await message.reply({ content: "You no longer have enough gold for this purchase." });
    } else {
      await message.reply({ content: `Purchase failed: ${(err as Error).message}` });
    }
  }
}

async function handleBuyExtraLandDrop(message: Message, quantity = 1): Promise<void> {
  const userId = message.author.id;
  const unitPrice = gameConfig.toolshop.extraLandDropPrice;
  const totalPrice = unitPrice * quantity;
  const balance = await getGold(userId);

  if (balance < totalPrice) {
    await message.reply({
      content: `You need **${totalPrice.toLocaleString()}** gold to buy **${quantity}** Extra LandDrop${quantity !== 1 ? "s" : ""}, but you only have **${balance.toLocaleString()}** gold.`
    });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const inv = await tx.userInventory.findUnique({
        where: { userId },
        select: { gold: true }
      });
      if ((inv?.gold ?? 0) < totalPrice) {
        throw new Error("insufficient_gold");
      }
      await tx.userInventory.upsert({
        where: { userId },
        create: { userId, gold: 0 },
        update: { gold: { increment: -totalPrice } }
      });
      await tx.extraLandDrop.createMany({
        data: Array.from({ length: quantity }, () => ({ userId }))
      });
    });

    const remaining = await getExtraLandDropCount(userId);
    await message.reply({
      content: `You bought **${quantity}** Extra LandDrop${quantity !== 1 ? "s" : ""} for **${totalPrice.toLocaleString()}** gold. You now have **${remaining}** Extra LandDrop${remaining !== 1 ? "s" : ""}.`
    });
  } catch (err) {
    if ((err as Error).message === "insufficient_gold") {
      await message.reply({ content: "You no longer have enough gold for this purchase." });
    } else {
      await message.reply({ content: `Purchase failed: ${(err as Error).message}` });
    }
  }
}

async function handleBurn(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  // Multiple IDs → multi-burn flow
  if (args.length > 1) {
    await handleMultiBurn(message, userId, args);
    return;
  }

  // Single ID (or no ID = last collected) → original flow
  const idArg = args[0]?.trim();
  const userCard = idArg
    ? await getUserCardByDisplayId(idArg)
    : await getLastCollectedCard(userId);

  if (!userCard) {
    await message.reply({
      content: idArg ? "No card in your collection with that ID." : "You have no cards to burn."
    });
    return;
  }

  if (userCard.userId !== userId) {
    await message.reply({ content: "That card is not in your collection." });
    return;
  }

  if (await isCardInFavoriteTag(userId, userCard.id)) {
    await message.reply({ content: "That card is in a favorited tag and cannot be burned." });
    return;
  }

  const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name, userCard.card.eurPrice);
  const gold = getGoldValue(String(baseUsd), userCard.condition);
  const image = getCardImageUrl(userCard.card);

  const embed = new EmbedBuilder()
    .setTitle("Burn Card")
    .setDescription(`<@${userId}>, you will receive:`)
    .addFields({
      name: "\u200b",
      value: `💰 **${gold} Gold**`,
      inline: false
    })
    .setColor(0x808080);

  if (image) {
    embed.setImage(image);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BURN_CANCEL_PREFIX}:${userId}:${userCard.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌"),
    new ButtonBuilder()
      .setCustomId(`${BURN_CONFIRM_PREFIX}:${userId}:${userCard.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔥")
  );

  await message.reply({
    embeds: [embed],
    components: [row]
  });
}

async function handleMultiBurn(message: Message, userId: string, args: string[]): Promise<void> {
  const ids = args.map(a => a.trim()).filter(Boolean);
  const cards: MultiBurnCard[] = [];
  const notFound: string[] = [];
  const notOwned: string[] = [];
  const skippedFavorites: string[] = [];

  const favoriteIds = await getFavoriteCardIds(userId);

  for (const id of ids) {
    const uc = await getUserCardByDisplayId(id);
    if (!uc) {
      notFound.push(id);
      continue;
    }
    if (uc.userId !== userId) {
      notOwned.push(id);
      continue;
    }
    // Avoid duplicates if same ID passed twice
    if (cards.some(c => c.userCardId === uc.id)) continue;

    if (favoriteIds.has(uc.id)) {
      skippedFavorites.push(id);
      continue;
    }

    const baseUsd = await resolveBasePrice(uc.card.usdPrice, uc.card.name, uc.card.eurPrice);
    const gold = getGoldValue(String(baseUsd), uc.condition);
    cards.push({
      userCardId: uc.id,
      displayId: uc.displayId,
      name: uc.card.name,
      setCode: uc.card.setCode,
      condition: uc.condition,
      gold
    });
  }

  // Report errors first
  const errorLines: string[] = [];
  if (notFound.length > 0) {
    errorLines.push(`Card${notFound.length !== 1 ? "s" : ""} not found: ${notFound.map(id => `\`${id}\``).join(", ")}`);
  }
  if (notOwned.length > 0) {
    errorLines.push(`Not in your collection: ${notOwned.map(id => `\`${id}\``).join(", ")}`);
  }
  if (skippedFavorites.length > 0) {
    errorLines.push(`Skipped (favorited): ${skippedFavorites.map(id => `\`${id}\``).join(", ")}`);
  }

  if (cards.length === 0) {
    await message.reply({ content: errorLines.length > 0 ? errorLines.join("\n") : "No valid cards to burn." });
    return;
  }

  const sessionId = createMultiBurnSession(userId, cards);
  const view = buildMultiBurnView(userId, sessionId, cards, 1);

  const errorPrefix = errorLines.length > 0 ? errorLines.join("\n") + "\n" : undefined;

  await message.reply({
    content: errorPrefix,
    embeds: [view.embed],
    components: view.components
  });
}

async function handleCooldowns(message: Message): Promise<void> {
  const userId = message.author.id;
  const claimRemainingMs = await getRemainingCooldownMs(userId, gameConfig.claimCooldownSeconds);
  const dropRemainingMs = await getDropCdMs(userId);
  const colordropRemainingMs = await getColordropCooldownRemainingMs(userId);
  const commanderdropRemainingMs = await getCommanderdropCooldownRemainingMs(userId);
  const landdropRemainingMs = await getLanddropCooldownRemainingMs(userId);

  const formatLine = (label: string, ms: number) =>
    ms <= 0
      ? `**${label}** is currently available.`
      : `**${label}** is available ${formatCooldownRemaining(ms)}.`;

  const embed = new EmbedBuilder()
    .setTitle("❓ View Cooldowns")
    .setDescription(
      `Showing cooldowns for <@${userId}>\n\n${formatLine("Claim", claimRemainingMs)}\n${formatLine("Drop", dropRemainingMs)}\n${formatLine("Color Drop", colordropRemainingMs)}\n${formatLine("Commander Drop", commanderdropRemainingMs)}\n${formatLine("Land Drop", landdropRemainingMs)}`
    )
    .setColor(0x2f3136);

  await message.reply({ embeds: [embed] });
}

async function handleTag(message: Message, args: string[], prefix: string): Promise<void> {
  const userId = message.author.id;

  if (args.length < 1) {
    await message.reply({ content: `Usage: \`${prefix}t <tagname> [cardid]\`` });
    return;
  }

  const tagname = args[0].trim();
  const cardIdArg = args[1]?.trim();

  const userCard = cardIdArg
    ? await getUserCardByDisplayId(cardIdArg)
    : await getLastCollectedCard(userId);

  if (!userCard) {
    await message.reply({
      content: cardIdArg ? "No card in your collection with that ID." : "You have no cards to tag."
    });
    return;
  }

  if (userCard.userId !== userId) {
    await message.reply({ content: "You can only tag your own cards." });
    return;
  }

  const result = await addCardToTag(userId, userCard.id, tagname);
  if (!result.ok) {
    await message.reply({
      content: result.reason === "tag_not_found"
        ? `You don't have a tag named **${tagname}**. Create it with \`/tagcreate\`.`
        : "You can only tag your own cards."
    });
    return;
  }

  await message.reply({
    content: `Tagged **${userCard.card.name}** (\`${userCard.displayId}\`) with **${tagname}**.`
  });
}

async function handleDeck(message: Message, args: string[], prefix: string): Promise<void> {
  const userId = message.author.id;

  if (args.length < 2) {
    await message.reply({ content: `Usage: \`${prefix}mt <tagname> <cardid1> [cardid2] ...\`` });
    return;
  }

  const tagname = args[0].trim();
  const cardIds = args.slice(1).map((a) => a.trim()).filter(Boolean);

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
    await message.reply({ content: lines.join("\n") || "No valid cards provided." });
    return;
  }

  const sessionId = createMultiTagSession(userId, tagname, cards);
  const view = buildMultiTagView(userId, sessionId, tagname, cards, 1);

  const errorLines: string[] = [];
  if (notFound.length > 0) errorLines.push(`Not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`);
  if (notOwned.length > 0) errorLines.push(`Not yours: ${notOwned.map((id) => `\`${id}\``).join(", ")}`);
  const errorPrefix = errorLines.length > 0 ? errorLines.join("\n") : undefined;

  await message.reply({
    content: errorPrefix,
    embeds: [view.embed],
    components: view.components
  });
}

async function handleLookup(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;
  const idArg = args[0]?.trim();

  const userCard = idArg
    ? await getUserCardByDisplayId(idArg)
    : await getLastCollectedCard(userId);

  if (!userCard) {
    await message.reply({
      content: idArg ? "No collected card found with that ID." : "You have no cards to look up."
    });
    return;
  }

  const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name, userCard.card.eurPrice);
  const displayPrice = formatConditionPrice(String(baseUsd), userCard.condition);
  const image = getCardImageUrl(userCard.card);
  const claimedAt = userCard.claimedAt.toISOString().split("T")[0];

  const embed = new EmbedBuilder()
    .setTitle(userCard.card.name)
    .addFields(
      { name: "ID", value: userCard.displayId, inline: true },
      { name: "Condition", value: formatConditionLabel(userCard.condition), inline: true },
      { name: "Gold", value: displayPrice, inline: true },
      { name: "Dropped", value: claimedAt, inline: true },
      { name: "Owner", value: `<@${userCard.userId}>`, inline: true }
    );

  if (image) {
    embed.setImage(image);
  }

  await message.reply({ embeds: [embed] });
}

async function handleWishadd(message: Message, args: string[], prefix: string): Promise<void> {
  if (!message.guildId) return;

  const cardName = args.join(" ").trim();
  if (!cardName) {
    await message.reply({ content: `Usage: \`${prefix}wa <card name>\`` });
    return;
  }

  const card = await findCardByQuery(cardName);
  if (!card) {
    await message.reply({ content: `No card found matching **${cardName}**.` });
    return;
  }

  const resolvedName = card.name;
  const userId = message.author.id;

  const exists = await wishlistEntryExists(userId, message.guildId, resolvedName);
  if (exists) {
    await message.reply({ content: `**${resolvedName}** is already on your wishlist.` });
    return;
  }

  const count = await getUserWishlistCount(userId, message.guildId);
  if (count >= gameConfig.maxWishlistSlots) {
    await message.reply({
      content: `Your wishlist is full (${gameConfig.maxWishlistSlots}/${gameConfig.maxWishlistSlots}). Remove a card with \`/wishremove\` first.`
    });
    return;
  }

  await addWishlistEntry(userId, message.guildId, resolvedName);
  await message.reply({
    content: `Added **${resolvedName}** to your wishlist (${count + 1}/${gameConfig.maxWishlistSlots}).`
  });
}

async function handleWishremove(message: Message, args: string[], prefix: string): Promise<void> {
  if (!message.guildId) return;

  const cardName = args.join(" ").trim();
  if (!cardName) {
    await message.reply({ content: `Usage: \`${prefix}wr <card name>\`` });
    return;
  }

  const userId = message.author.id;

  // Try to resolve the input to an exact card name via fuzzy matching
  const card = await findCardByQuery(cardName);
  if (card) {
    const removed = await removeWishlistEntry(userId, message.guildId, card.name);
    if (removed) {
      await message.reply({ content: `Removed **${card.name}** from your wishlist.` });
      return;
    }
  }

  // If card DB lookup didn't match a wishlist entry, try the raw input directly
  const removed = await removeWishlistEntry(userId, message.guildId, cardName);
  if (removed) {
    await message.reply({ content: `Removed **${cardName}** from your wishlist.` });
    return;
  }

  await message.reply({
    content: `**${cardName}** was not found on your wishlist. Use \`/wl\` to view your wishlist.`
  });
}

async function handleFav(message: Message, args: string[], prefix: string): Promise<void> {
  const tagName = args.join(" ").trim();
  if (!tagName) {
    await message.reply({ content: `Usage: \`${prefix}fav <tagname>\`` });
    return;
  }

  const userId = message.author.id;
  const result = await setTagFavorite(userId, tagName, true);

  if (!result.ok) {
    const messages: Record<string, string> = {
      tag_not_found: "Tag not found. Use `/tags` to list your tags.",
      already_favorite: `Tag **${tagName}** is already favorited.`,
      limit_reached: "You can only favorite up to **5** tags. Unfavorite one first with `/unfav`."
    };
    await message.reply({ content: messages[result.reason!] ?? "Could not favorite that tag." });
    return;
  }

  await message.reply({
    content: `Tag **${tagName}** is now favorited. Cards in this tag are protected from burning.`
  });
}

async function handleUnfav(message: Message, args: string[], prefix: string): Promise<void> {
  const tagName = args.join(" ").trim();
  if (!tagName) {
    await message.reply({ content: `Usage: \`${prefix}unfav <tagname>\`` });
    return;
  }

  const userId = message.author.id;
  const result = await setTagFavorite(userId, tagName, false);

  if (!result.ok) {
    const messages: Record<string, string> = {
      tag_not_found: "Tag not found. Use `/tags` to list your tags.",
      not_favorite: `Tag **${tagName}** is not favorited.`
    };
    await message.reply({ content: messages[result.reason!] ?? "Could not unfavorite that tag." });
    return;
  }

  await message.reply({
    content: `Tag **${tagName}** is no longer favorited.`
  });
}

async function handleSetCommander(message: Message, args: string[], prefix: string): Promise<void> {
  if (!message.guildId) return;

  if (!args[0]) {
    await message.reply({ content: `Usage: \`${prefix}setcmd <card-id>\`` });
    return;
  }

  const displayId = args[0].trim();
  const userCard = await getUserCardByDisplayId(displayId);

  if (!userCard) {
    await message.reply({ content: "No card found with that ID." });
    return;
  }

  if (userCard.userId !== message.author.id) {
    await message.reply({ content: "You don't own that card." });
    return;
  }

  if (!isLegendaryCreature(userCard.card.typeLine, { isMeldResult: userCard.card.isMeldResult })) {
    await message.reply({ content: "Only legendary commanders are eligible for Clash battles." });
    return;
  }

  await prisma.clashCreature.upsert({
    where: {
      discordId_guildId: {
        discordId: message.author.id,
        guildId: message.guildId
      }
    },
    create: {
      discordId: message.author.id,
      guildId: message.guildId,
      userCardId: userCard.id
    },
    update: {
      userCardId: userCard.id,
      clashWins: 0,
      clashLosses: 0
    }
  });

  const stats = buildClashStats(userCard.card, userCard.condition, userCard);
  const imageUrl = getCardImageUrl(userCard.card);
  const embed = buildStatsEmbed(stats, imageUrl, userCard.condition);

  await message.reply({
    content: `Your clash commander has been set to **${stats.name}**!`,
    embeds: [embed]
  });
}

async function handleStats(message: Message, args: string[], prefix: string): Promise<void> {
  if (!args[0]) {
    // No argument: show currently set commander's stats
    if (!message.guildId) return;

    const creature = await prisma.clashCreature.findUnique({
      where: {
        discordId_guildId: { discordId: message.author.id, guildId: message.guildId }
      },
      include: { userCard: { include: { card: true } } }
    });

    if (!creature) {
      await message.reply({ content: "You haven't set a commander! Use `/setcommander <id>` first." });
      return;
    }

    const stats = buildClashStats(creature.userCard.card, creature.userCard.condition, creature.userCard);
    const imageUrl = getCardImageUrl(creature.userCard.card);

    let record: string | null = `${creature.clashWins}W ${creature.clashLosses}L`;
    const towerBest = await getCommanderRecord(message.author.id, message.guildId, creature.userCard.id);
    if (towerBest > 0) {
      record += ` | Endless Tower: Floor ${towerBest}`;
    }
    const userBest = await getBestRecord(message.author.id, message.guildId);
    if (userBest > 0 && userBest !== towerBest) {
      record += ` | Best: Floor ${userBest}`;
    }

    const embed = buildStatsEmbed(stats, imageUrl, creature.userCard.condition, record);
    await message.reply({ embeds: [embed] });
    return;
  }

  const displayId = args[0].trim();
  const userCard = await getUserCardByDisplayId(displayId);

  if (!userCard) {
    await message.reply({ content: "No card found with that ID." });
    return;
  }

  if (!isLegendaryCreature(userCard.card.typeLine, { isMeldResult: userCard.card.isMeldResult })) {
    await message.reply({ content: "Only legendary commanders have Clash stats." });
    return;
  }

  const stats = buildClashStats(userCard.card, userCard.condition, userCard);
  const imageUrl = getCardImageUrl(userCard.card);

  let record: string | null = null;
  const clashCreature = await prisma.clashCreature.findFirst({
    where: { userCardId: userCard.id }
  });
  if (clashCreature) {
    record = `${clashCreature.clashWins}W ${clashCreature.clashLosses}L`;
    if (message.guildId) {
      const towerBest = await getCommanderRecord(message.author.id, message.guildId, userCard.id);
      if (towerBest > 0) {
        record += ` | Endless Tower: Floor ${towerBest}`;
      }
    }
  }

  const embed = buildStatsEmbed(stats, imageUrl, userCard.condition, record);
  await message.reply({ embeds: [embed] });
}

async function handleClash(message: Message): Promise<void> {
  if (!message.guildId) return;

  const clashCreature = await prisma.clashCreature.findUnique({
    where: {
      discordId_guildId: {
        discordId: message.author.id,
        guildId: message.guildId
      }
    },
    include: {
      userCard: { include: { card: true } }
    }
  });

  if (!clashCreature) {
    await message.reply({ content: "You haven't set a commander yet! Use `/setcommander <id>` first." });
    return;
  }

  if (clashCreature.userCard.userId !== message.author.id) {
    await prisma.clashCreature.delete({ where: { id: clashCreature.id } });
    await message.reply({ content: "You no longer own your set commander. Use `/setcommander <id>` to set a new one." });
    return;
  }

  if (!isLegendaryCreature(clashCreature.userCard.card.typeLine, { isMeldResult: clashCreature.userCard.card.isMeldResult })) {
    await prisma.clashCreature.delete({ where: { id: clashCreature.id } });
    await message.reply({ content: "Your set commander is no longer eligible. Use `/setcommander <id>` to set a new one." });
    return;
  }

  const stats = buildClashStats(clashCreature.userCard.card, clashCreature.userCard.condition, clashCreature.userCard);
  const imageUrl = getCardImageUrl(clashCreature.userCard.card);
  const embed = buildChallengeEmbed(message.author.displayName, stats, imageUrl, clashCreature.userCard.condition);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLASH_ACCEPT_PREFIX}:${message.author.id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CLASH_DECLINE_PREFIX}:${message.author.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
  );

  const reply = await message.reply({
    embeds: [embed],
    components: [row]
  });

  const expireMs = gameConfig.clash.challengeExpireSeconds * 1000;
  setTimeout(async () => {
    try {
      const msg = await message.channel?.messages.fetch(reply.id).catch(() => null);
      if (msg && msg.components.length > 0) {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${CLASH_ACCEPT_PREFIX}:expired`)
            .setLabel("Expired")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        await msg.edit({ components: [disabledRow] });
      }
    } catch {
      // Ignore — message may have been deleted
    }
  }, expireMs);
}

async function handleDailyRaid(message: Message): Promise<void> {
  if (!message.guildId) return;

  const boss = await getDailyBoss();
  const imageUrl = getCardImageUrl(boss.card);
  const embed = buildDailyRaidEmbed(boss.stats, imageUrl, boss.bonusAbilities);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DAILYRAID_CHALLENGE_PREFIX}:${message.author.id}`)
      .setLabel("Challenge")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${DAILYRAID_RUN_PREFIX}:${message.author.id}`)
      .setLabel("Run Away")
      .setStyle(ButtonStyle.Danger)
  );

  await message.reply({
    embeds: [embed],
    components: [row]
  });
}

async function handleEndless(message: Message): Promise<void> {
  if (!message.guildId) return;

  const clashCreature = await prisma.clashCreature.findUnique({
    where: {
      discordId_guildId: { discordId: message.author.id, guildId: message.guildId }
    },
    include: {
      userCard: { include: { card: true } }
    }
  });

  if (!clashCreature) {
    await message.reply("You haven't set a commander! Use `/setcommander <id>` first.");
    return;
  }

  if (!isLegendaryCreature(clashCreature.userCard.card.typeLine, { isMeldResult: clashCreature.userCard.card.isMeldResult })) {
    await message.reply("Your set commander is no longer valid. Use `/setcommander <id>` to set a new one.");
    return;
  }

  const stats = buildClashStats(clashCreature.userCard.card, clashCreature.userCard.condition, clashCreature.userCard);
  const imageUrl = getCardImageUrl(clashCreature.userCard.card);

  const commanderBest = await getCommanderRecord(
    message.author.id,
    message.guildId,
    clashCreature.userCard.id
  );
  const userBest = await getBestRecord(message.author.id, message.guildId);

  let record = `${clashCreature.clashWins}W ${clashCreature.clashLosses}L`;
  if (commanderBest > 0) {
    record += ` | Endless Tower: Floor ${commanderBest}`;
  }
  if (userBest > 0 && userBest !== commanderBest) {
    record += ` | Best: Floor ${userBest}`;
  }

  const embed = buildStatsEmbed(stats, imageUrl, clashCreature.userCard.condition, record);
  embed.setTitle(`${stats.name} - Endless Tower`);
  embed.setDescription(
    "Challenge the **Endless Tower** and fight through increasingly difficult bosses!\n\n" +
    "Each floor has a random boss that gets stronger. " +
    "How far can you go?"
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ENDLESS_CHALLENGE_PREFIX}:${message.author.id}`)
      .setLabel("Challenge Endless Tower")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${ENDLESS_CANCEL_PREFIX}:${message.author.id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
  );

  await message.reply({
    embeds: [embed],
    components: [row]
  });
}
