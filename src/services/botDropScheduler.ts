import type { Client } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import { gameConfig } from "../config.js";
import { getRandomDroppableCards } from "../repositories/cardRepo.js";
import { getAllDropChannels } from "../repositories/botConfigRepo.js";
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
  const dropToGuild = async (channelId: string, guildId: string) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("send" in channel)) {
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
    const components = buildDropComponents(drop);

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
  };

  const dropWithRetry = async (channelId: string, guildId: string, retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await dropToGuild(channelId, guildId);
        return;
      } catch (err) {
        const isTransient =
          err instanceof Error &&
          ("code" in err && (err as { code?: string }).code === "UND_ERR_CONNECT_TIMEOUT" ||
           err.name === "AbortError" ||
           err.message.includes("getaddrinfo") ||
           err.message.includes("ECONNRESET"));
        if (!isTransient || attempt === retries) {
          console.error(`Bot drop failed for guild ${guildId}:`, err);
          return;
        }
        const delay = 2000 * 2 ** attempt;
        console.warn(`Bot drop for guild ${guildId} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };

  const run = async () => {
    const dropChannels = await getAllDropChannels();
    for (const { guildId, dropChannelId } of dropChannels) {
      await dropWithRetry(dropChannelId, guildId);
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
