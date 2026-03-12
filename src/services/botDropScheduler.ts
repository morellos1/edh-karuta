import type { Client } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import { gameConfig } from "../config.js";
import { getRandomDroppableCards } from "../repositories/cardRepo.js";
import { getDropChannelId } from "../repositories/botConfigRepo.js";
import { buildDropCollage } from "./collageService.js";
import { createDropRecord, attachDropMessage } from "./dropService.js";
import { buildDropComponents, scheduleDropTimeout } from "../interactions/claimButton.js";
import { buildWishlistNotification } from "./wishlistService.js";
import { prisma } from "../db.js";

const BOT_DROP_INTERVAL_MS = gameConfig.autoDropIntervalSeconds * 1000;
const DROP_SIZE = 3;

async function getInitialDelay(botUserId: string): Promise<number> {
  const lastBotDrop = await prisma.drop.findFirst({
    where: { dropperUserId: botUserId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });

  if (!lastBotDrop) return BOT_DROP_INTERVAL_MS;

  const elapsed = Date.now() - lastBotDrop.createdAt.getTime();
  const remaining = BOT_DROP_INTERVAL_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

export function startBotDropScheduler(client: Client) {
  const run = async () => {
    try {
      const channelId = await getDropChannelId();
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !("send" in channel) || !("guildId" in channel)) {
        return;
      }
      const guildId = channel.guildId;
      if (!guildId) {
        return;
      }

      const cards = await getRandomDroppableCards(DROP_SIZE);
      const expiresAt = new Date(Date.now() + gameConfig.dropExpireSeconds * 1000);
      const botUserId = client.user?.id;
      if (!botUserId) {
        return;
      }

      const drop = await createDropRecord({
        guildId,
        channelId: channel.id,
        dropperUserId: botUserId,
        expiresAt,
        cards
      });

      const collage = await buildDropCollage(cards);
      const attachment = new AttachmentBuilder(collage, { name: "drop.webp" });
      const components = await buildDropComponents(drop.id);

      const dropLine = "I'm dropping 3 cards!";
      const wishNotification = await buildWishlistNotification(
        guildId,
        cards.map((c) => c.name)
      );
      const content = wishNotification
        ? `${wishNotification}\n\n${dropLine}`
        : dropLine;

      const message = await channel.send({
        content,
        files: [attachment],
        components
      });

      await attachDropMessage(drop.id, message.id);
      scheduleDropTimeout(client, {
        dropId: drop.id,
        channelId: channel.id,
        messageId: message.id,
        expiresAt
      });
    } catch (err) {
      console.error("Bot drop failed:", err);
    }
  };

  const botUserId = client.user?.id;
  if (!botUserId) return;

  void getInitialDelay(botUserId).then((delay) => {
    setTimeout(() => {
      void run();
      setInterval(run, BOT_DROP_INTERVAL_MS);
    }, delay);
  });
}
