import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  Message,
  User
} from "discord.js";
import { getGuildSettings } from "../repositories/guildSettingsRepo.js";
import { gameConfig } from "../config.js";
import { getRandomDroppableCards } from "../repositories/cardRepo.js";
import { getDropCooldownRemainingMs, setDropUsed } from "../repositories/botConfigRepo.js";
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
import {
  getMarketSlot,
  getMarketCardsForSlot,
  getMarketPage
} from "../services/marketService.js";
import { buildMarketGrid } from "../services/collageService.js";
import { buildMarketEmbed, buildMarketButtons } from "../commands/market.js";
import { getRemainingCooldownMs } from "../services/cooldownService.js";
import {
  getDropCooldownRemainingMs as getDropCdMs,
  getCommanderdropCooldownRemainingMs,
  getColordropCooldownRemainingMs,
  getLanddropCooldownRemainingMs
} from "../repositories/botConfigRepo.js";
import { addCardToTag } from "../repositories/tagRepo.js";
import {
  formatConditionLabel,
  formatConditionPrice
} from "../services/conditionService.js";
import { findCardByQuery } from "../repositories/cardRepo.js";
import {
  addWishlistEntry,
  getUserWishlistCount,
  wishlistEntryExists
} from "../repositories/wishlistRepo.js";
import {
  EmbedBuilder,
  ButtonStyle
} from "discord.js";

const DROP_SIZE = 3;
const withDropLock = createAsyncLock();

const SORT_KEYWORDS: Record<string, CollectionSort> = {
  color: "color",
  price: "price_desc",
  rarity: "rarity",
  recent: "recent",
  price_asc: "price_asc",
  price_desc: "price_desc"
};

const VIEW_KEYWORDS: Record<string, CollectionViewMode> = {
  album: "album",
  list: "list"
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

  switch (parsed.command) {
    case "d":
      await handleDrop(message);
      break;
    case "c":
      await handleCollection(message, parsed.args);
      break;
    case "m":
      await handleMarket(message);
      break;
    case "b":
      await handleBurn(message, parsed.args);
      break;
    case "cd":
      await handleCooldowns(message);
      break;
    case "t":
      await handleTag(message, parsed.args);
      break;
    case "lu":
      await handleLookup(message, parsed.args);
      break;
    case "wa":
      await handleWishadd(message, parsed.args);
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
    const components = await buildDropComponents(drop.id);

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
    await message.reply({ content: `Drop failed: ${(error as Error).message}` });
  }
}

async function handleCollection(message: Message, args: string[]): Promise<void> {
  let targetUser: User = message.author;
  let sort: CollectionSort = "recent";
  let viewMode: CollectionViewMode = "list";
  let tagName: string | null = null;

  for (const arg of args) {
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

    // Anything else is treated as tag name
    tagName = arg;
  }

  const view = await buildCollectionView(targetUser, 1, sort, viewMode, message.author.id, tagName);
  if (view == null) {
    await message.reply({ content: "Tag not found. Use `/tags` to list your tags." });
    return;
  }

  if (viewMode === "album" && view.file) {
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
  const collage = await buildMarketGrid(
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

async function handleBurn(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;
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

  const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name);
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

async function handleTag(message: Message, args: string[]): Promise<void> {
  const userId = message.author.id;

  if (args.length < 1) {
    await message.reply({ content: "Usage: `<prefix>t <tagname> [cardid]`" });
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

  const baseUsd = await resolveBasePrice(userCard.card.usdPrice, userCard.card.name);
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

async function handleWishadd(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;

  const cardName = args.join(" ").trim();
  if (!cardName) {
    await message.reply({ content: "Usage: `<prefix>wa <card name>`" });
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
