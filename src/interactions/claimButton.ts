import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client
} from "discord.js";
import { gameConfig } from "../config.js";
import { getDropById, markDropResolved, submitClaim } from "../services/dropService.js";
import { getConditionClaimPhrase } from "../services/conditionService.js";
import { formatCooldownRemaining } from "../utils/cooldownFormatting.js";

export const CLAIM_BUTTON_PREFIX = "claim";
const timeoutMap = new Map<number, NodeJS.Timeout>();

function formatSlotLabel(slotIndex: number) {
  return `${slotIndex + 1}`;
}

type DropForComponents = {
  id: number;
  slots: Array<{ slotIndex: number; claimedByUserId: string | null }>;
};

export function buildDropComponents(drop: DropForComponents) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const slot of drop.slots) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${CLAIM_BUTTON_PREFIX}:${drop.id}:${slot.slotIndex}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel(formatSlotLabel(slot.slotIndex))
        .setDisabled(Boolean(slot.claimedByUserId))
    );
  }

  return [row];
}

function allSlotsClaimed(claimedBy: Array<string | null>) {
  return claimedBy.every(Boolean);
}

export function scheduleDropTimeout(client: Client, params: {
  dropId: number;
  channelId: string;
  messageId: string;
  expiresAt: Date;
}) {
  const { dropId, channelId, messageId, expiresAt } = params;
  const delay = Math.max(0, expiresAt.getTime() - Date.now());

  const existing = timeoutMap.get(dropId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        return;
      }

      const message = await channel.messages.fetch(messageId);
      await message.edit({
        content: "*This drop has expired and the cards can no longer be claimed.*",
        components: []
      });
      await markDropResolved(dropId);
    } catch {
      // Ignore timeout edit failures.
    } finally {
      timeoutMap.delete(dropId);
    }
  }, delay);

  timeoutMap.set(dropId, timeout);
}

export async function handleClaimButton(interaction: ButtonInteraction) {
  const [prefix, dropIdRaw, slotIndexRaw] = interaction.customId.split(":");
  if (prefix !== CLAIM_BUTTON_PREFIX) {
    return;
  }

  const dropId = Number(dropIdRaw);
  const slotIndex = Number(slotIndexRaw);
  if (!Number.isInteger(dropId) || !Number.isInteger(slotIndex)) {
    await interaction.reply({ content: "Invalid claim payload.", ephemeral: true });
    return;
  }

  const result = await submitClaim({
    dropId,
    slotIndex,
    userId: interaction.user.id,
    cooldownSeconds: gameConfig.claimCooldownSeconds
  });

  if (!result.ok) {
    if (result.reason === "cooldown") {
      const remainingMs = result.remainingMs ?? 0;
      await interaction.reply({
        content: `<@${interaction.user.id}>, you can claim another card ${formatCooldownRemaining(remainingMs)}.`,
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      content: "Claim failed (already claimed, expired, or invalid).",
      ephemeral: true
    });
    return;
  }

  const drop = await getDropById(dropId);
  if (!drop) {
    await interaction.reply({ content: "Drop no longer exists.", ephemeral: true });
    return;
  }

  const claimedBy = drop.slots.map((slot: (typeof drop.slots)[number]) => slot.claimedByUserId);
  const components = allSlotsClaimed(claimedBy) ? [] : buildDropComponents(drop);

  const isBotDrop = drop.dropperUserId === interaction.client.user?.id;
  const dropContent = isBotDrop
    ? "I'm dropping 3 cards!"
    : `<@${drop.dropperUserId}> is dropping 3 cards!`;

  await interaction.update({
    content: dropContent,
    components
  });

  const claimedSlot = drop.slots.find((slot) => slot.slotIndex === result.slotIndex);
  if (
    claimedSlot &&
    result.ok &&
    "displayId" in result &&
    "condition" in result &&
    interaction.channel &&
    "send" in interaction.channel
  ) {
    const phrase = getConditionClaimPhrase(result.condition);
    await interaction.channel.send(
      `<@${interaction.user.id}> took the **${claimedSlot.card.name}** card \`${result.displayId}\`! ${phrase}`
    );

    if (result.extraClaimUsed) {
      const remaining = result.extraClaimRemaining ?? 0;
      await interaction.channel.send(
        `<@${interaction.user.id}>, your Extra Claim has been consumed. \uD83D\uDC50 You have ${remaining} remaining.`
      );
    }
  }

  if (allSlotsClaimed(claimedBy) && drop.messageId) {
    await markDropResolved(drop.id);
    const timeout = timeoutMap.get(drop.id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutMap.delete(drop.id);
    }
  }
}
