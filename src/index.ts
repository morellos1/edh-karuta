import { Client, Collection, GatewayIntentBits, Interaction, REST, Routes } from "discord.js";
import { env } from "./config.js";
import { dropCommand } from "./commands/drop.js";
import { cdCommand } from "./commands/cd.js";
import { setdropchannelCommand } from "./commands/setdropchannel.js";
import { colordropCommand } from "./commands/colordrop.js";
import { commanderdropCommand } from "./commands/commanderdrop.js";
import { COLLECTION_BUTTON_PREFIX, COLLECTION_EXPORT_PREFIX, collectionCommand } from "./commands/collection.js";
import { cardCommand } from "./commands/card.js";
import { lookupCommand } from "./commands/lookup.js";
import { burnCommand } from "./commands/burn.js";
import { marketCommand } from "./commands/market.js";
import { buyCommand } from "./commands/buy.js";
import { giveCommand } from "./commands/give.js";
import { tradeCommand } from "./commands/trade.js";
import { tagcreateCommand } from "./commands/tagcreate.js";
import { tagdeleteCommand } from "./commands/tagdelete.js";
import { tagrenameCommand } from "./commands/tagrename.js";
import { tagCommand } from "./commands/tag.js";
import { tagsCommand } from "./commands/tags.js";
import { untagCommand } from "./commands/untag.js";
import { wishaddCommand } from "./commands/wishadd.js";
import { wishremoveCommand } from "./commands/wishremove.js";
import { wlCommand } from "./commands/wl.js";
import { handleClaimButton, CLAIM_BUTTON_PREFIX } from "./interactions/claimButton.js";
import { handleCollectionPageButton } from "./interactions/collectionButton.js";
import { handleCardPrintButton, CARD_PRINT_PREFIX } from "./interactions/cardPrintButton.js";
import { handleBurnConfirmButton, handleBurnCancelButton } from "./interactions/burnButton.js";
import {
  GIVE_ACCEPT_PREFIX,
  GIVE_DECLINE_PREFIX,
  TRADE_ACCEPT_PREFIX,
  TRADE_DECLINE_PREFIX,
  handleTradeGiveButtons
} from "./interactions/tradeGiveButton.js";
import { prisma } from "./db.js";
import type { SlashCommand } from "./commands/types.js";
import { startBotDropScheduler } from "./services/botDropScheduler.js";

const commands = [
  dropCommand,
  cdCommand,
  setdropchannelCommand,
  colordropCommand,
  commanderdropCommand,
  collectionCommand,
  cardCommand,
  lookupCommand,
  burnCommand,
  marketCommand,
  buyCommand,
  giveCommand,
  tradeCommand,
  tagcreateCommand,
  tagdeleteCommand,
  tagrenameCommand,
  tagCommand,
  tagsCommand,
  untagCommand,
  wishaddCommand,
  wishremoveCommand,
  wlCommand
];
const commandMap = new Collection<string, SlashCommand>();
for (const command of commands) {
  commandMap.set(command.data.name, command);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag}`);
  startBotDropScheduler(client);
});

client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith(`${CLAIM_BUTTON_PREFIX}:`)) {
      await handleClaimButton(interaction);
      return;
    }
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith(`${COLLECTION_BUTTON_PREFIX}:`) ||
        interaction.customId.startsWith(`${COLLECTION_EXPORT_PREFIX}:`))
    ) {
      await handleCollectionPageButton(interaction);
      return;
    }
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(`${CARD_PRINT_PREFIX}:`)
    ) {
      await handleCardPrintButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("burn_confirm:")) {
      await handleBurnConfirmButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("burn_cancel:")) {
      await handleBurnCancelButton(interaction);
      return;
    }
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith(`${GIVE_ACCEPT_PREFIX}:`) ||
        interaction.customId.startsWith(`${GIVE_DECLINE_PREFIX}:`) ||
        interaction.customId.startsWith(`${TRADE_ACCEPT_PREFIX}:`) ||
        interaction.customId.startsWith(`${TRADE_DECLINE_PREFIX}:`))
    ) {
      await handleTradeGiveButtons(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
      return;
    }

    await command.execute(interaction);
  } catch (error: unknown) {
    const isUnknownInteraction =
      error && typeof error === "object" && "code" in error && (error as { code: number }).code === 10062;
    if (isUnknownInteraction) {
      return;
    }
    if (interaction.isRepliable()) {
      const payload = {
        content: "Unexpected error running command.",
        flags: 64
      };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (replyError: unknown) {
        const code = replyError && typeof replyError === "object" && "code" in replyError ? (replyError as { code: number }).code : null;
        if (code === 10062) return;
        console.error("Failed to send error reply:", replyError);
      }
    }
    console.error(error);
  }
});

async function registerCommandsOnStartup() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
    body: commands.map((c) => c.data.toJSON())
  });
}

async function bootstrap() {
  await registerCommandsOnStartup();
  await client.login(env.DISCORD_TOKEN);
}

void bootstrap();

const shutdown = async () => {
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
