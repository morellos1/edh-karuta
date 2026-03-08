import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../db.js";
import { getUserCardByDisplayId } from "../repositories/userCardRepo.js";
import { stripTagsFromUserCard } from "../repositories/tagRepo.js";

export const GIVE_ACCEPT_PREFIX = "give_accept";
export const GIVE_DECLINE_PREFIX = "give_decline";
export const TRADE_ACCEPT_PREFIX = "trade_accept";
export const TRADE_DECLINE_PREFIX = "trade_decline";

function withStatus(embedLike: unknown, status: string, color: number): EmbedBuilder {
  const existing =
    embedLike && typeof embedLike === "object"
      ? EmbedBuilder.from(embedLike as object)
      : new EmbedBuilder();
  return existing
    .addFields({
      name: "\u200b",
      value: `**${status}**`,
      inline: false
    })
    .setColor(color);
}

/** Same as withStatus but also clears the embed image (for trade accept/decline so the card image is not shown again). */
function withStatusNoImage(embedLike: unknown, status: string, color: number): EmbedBuilder {
  return withStatus(embedLike, status, color).setImage(null);
}

function recipientOnly(interaction: ButtonInteraction, toUserId: string): boolean {
  return interaction.user.id === toUserId;
}

async function handleGiveAccept(interaction: ButtonInteraction, fromUserId: string, toUserId: string, displayId: string) {
  if (!recipientOnly(interaction, toUserId)) {
    await interaction.reply({ content: "Only the tagged recipient can respond to this give request.", ephemeral: true });
    return;
  }

  const card = await getUserCardByDisplayId(displayId);
  if (!card || card.userId !== fromUserId) {
    const embed = withStatus(interaction.message.embeds[0], "Transfer failed: card ownership changed.", 0xed4245);
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  await prisma.userCard.update({
    where: { id: card.id },
    data: { userId: toUserId }
  });
  await stripTagsFromUserCard(card.id);

  const embed = withStatus(interaction.message.embeds[0], "Card transfer accepted.", 0x57f287);
  await interaction.update({ embeds: [embed], components: [] });
}

async function handleGiveDecline(interaction: ButtonInteraction, toUserId: string) {
  if (!recipientOnly(interaction, toUserId)) {
    await interaction.reply({ content: "Only the tagged recipient can respond to this give request.", ephemeral: true });
    return;
  }
  const embed = withStatus(interaction.message.embeds[0], "Card transfer declined.", 0xed4245);
  await interaction.update({ embeds: [embed], components: [] });
}

async function handleTradeAccept(
  interaction: ButtonInteraction,
  fromUserId: string,
  toUserId: string,
  myCardDisplayId: string,
  theirCardDisplayId: string
) {
  if (!recipientOnly(interaction, toUserId)) {
    await interaction.reply({ content: "Only the tagged recipient can respond to this trade request.", ephemeral: true });
    return;
  }

  const myCard = await getUserCardByDisplayId(myCardDisplayId);
  const theirCard = await getUserCardByDisplayId(theirCardDisplayId);
  if (!myCard || !theirCard || myCard.userId !== fromUserId || theirCard.userId !== toUserId) {
    const embed = withStatusNoImage(interaction.message.embeds[0], "Trade failed: one or both cards changed owner.", 0xed4245);
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  const tmpOwner = `__trade_tmp_${Date.now()}_${myCard.id}`;
  await prisma.$transaction(async (tx) => {
    await tx.userCard.update({
      where: { id: myCard.id },
      data: { userId: tmpOwner }
    });
    await tx.userCard.update({
      where: { id: theirCard.id },
      data: { userId: fromUserId }
    });
    await tx.userCard.update({
      where: { id: myCard.id },
      data: { userId: toUserId }
    });
  });
  await stripTagsFromUserCard(myCard.id);
  await stripTagsFromUserCard(theirCard.id);

  const embed = withStatusNoImage(interaction.message.embeds[0], "Trade accepted.", 0x57f287);
  await interaction.update({ embeds: [embed], components: [] });
}

async function handleTradeDecline(interaction: ButtonInteraction, toUserId: string) {
  if (!recipientOnly(interaction, toUserId)) {
    await interaction.reply({ content: "Only the tagged recipient can respond to this trade request.", ephemeral: true });
    return;
  }
  const embed = withStatusNoImage(interaction.message.embeds[0], "Trade declined.", 0xed4245);
  await interaction.update({ embeds: [embed], components: [] });
}

export async function handleTradeGiveButtons(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const prefix = parts[0];

  if (prefix === GIVE_ACCEPT_PREFIX) {
    const [, fromUserId, toUserId, displayId] = parts;
    if (!fromUserId || !toUserId || !displayId) {
      await interaction.reply({ content: "Invalid give payload.", ephemeral: true });
      return;
    }
    await handleGiveAccept(interaction, fromUserId, toUserId, displayId);
    return;
  }

  if (prefix === GIVE_DECLINE_PREFIX) {
    const [, , toUserId] = parts;
    if (!toUserId) {
      await interaction.reply({ content: "Invalid give payload.", ephemeral: true });
      return;
    }
    await handleGiveDecline(interaction, toUserId);
    return;
  }

  if (prefix === TRADE_ACCEPT_PREFIX) {
    const [, fromUserId, toUserId, myCardDisplayId, theirCardDisplayId] = parts;
    if (!fromUserId || !toUserId || !myCardDisplayId || !theirCardDisplayId) {
      await interaction.reply({ content: "Invalid trade payload.", ephemeral: true });
      return;
    }
    await handleTradeAccept(interaction, fromUserId, toUserId, myCardDisplayId, theirCardDisplayId);
    return;
  }

  if (prefix === TRADE_DECLINE_PREFIX) {
    const [, , toUserId] = parts;
    if (!toUserId) {
      await interaction.reply({ content: "Invalid trade payload.", ephemeral: true });
      return;
    }
    await handleTradeDecline(interaction, toUserId);
  }
}
