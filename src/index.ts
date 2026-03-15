import { Client, Collection, GatewayIntentBits, Interaction, Message, REST, Routes } from "discord.js";
import { env } from "./config.js";
import { dropCommand } from "./commands/drop.js";
import { cdCommand } from "./commands/cd.js";
import { setdropchannelCommand } from "./commands/setdropchannel.js";
import { colordropCommand } from "./commands/colordrop.js";
import { commanderdropCommand } from "./commands/commanderdrop.js";
import { landdropCommand } from "./commands/landdrop.js";
import { COLLECTION_BUTTON_PREFIX, COLLECTION_EXPORT_PREFIX, collectionCommand } from "./commands/collection.js";
import { cardCommand } from "./commands/card.js";
import { lookupCommand } from "./commands/lookup.js";
import { burnCommand } from "./commands/burn.js";
import { bulkburnCommand, BULKBURN_CONFIRM_PREFIX, BULKBURN_CANCEL_PREFIX } from "./commands/bulkburn.js";
import { marketCommand, MARKET_BUTTON_PREFIX } from "./commands/market.js";
import { handleMarketPageButton } from "./interactions/marketButton.js";
import { buyCommand } from "./commands/buy.js";
import { giveCommand } from "./commands/give.js";
import { tradeCommand } from "./commands/trade.js";
import { tagcreateCommand } from "./commands/tagcreate.js";
import { tagdeleteCommand } from "./commands/tagdelete.js";
import { tagrenameCommand } from "./commands/tagrename.js";
import { tagCommand } from "./commands/tag.js";
import { multitagCommand } from "./commands/multitag.js";
import { tagsCommand } from "./commands/tags.js";
import { untagCommand } from "./commands/untag.js";
import { wishaddCommand } from "./commands/wishadd.js";
import { wishremoveCommand } from "./commands/wishremove.js";
import { wlCommand } from "./commands/wl.js";
import { handleClaimButton, CLAIM_BUTTON_PREFIX } from "./interactions/claimButton.js";
import { handleCollectionPageButton } from "./interactions/collectionButton.js";
import { handleCardPrintButton, handleCardWishaddButton, CARD_PRINT_PREFIX, CARD_WISHADD_PREFIX } from "./interactions/cardPrintButton.js";
import { handleBurnConfirmButton, handleBurnCancelButton } from "./interactions/burnButton.js";
import { handleBulkBurnConfirmButton, handleBulkBurnCancelButton } from "./interactions/bulkBurnButton.js";
import {
  GIVE_ACCEPT_PREFIX,
  GIVE_DECLINE_PREFIX,
  TRADE_ACCEPT_PREFIX,
  TRADE_DECLINE_PREFIX,
  handleTradeGiveButtons
} from "./interactions/tradeGiveButton.js";
import { prisma } from "./db.js";
import type { SlashCommand } from "./commands/types.js";
import { toolshopCommand } from "./commands/toolshop.js";
import { setprefixCommand } from "./commands/setprefix.js";
import { shortcutCommand } from "./commands/shortcut.js";
import { handleShortcut } from "./handlers/shortcutHandler.js";
import { startBotDropScheduler } from "./services/botDropScheduler.js";
import { startDropCleanupScheduler } from "./services/dropCleanupService.js";
import { setcreatureCommand } from "./commands/setcreature.js";
import { creaturestatsCommand } from "./commands/clashstats.js";
import { clashCommand, CLASH_ACCEPT_PREFIX, CLASH_DECLINE_PREFIX } from "./commands/clash.js";
import { handleClashButtons } from "./interactions/clashButton.js";

const commands = [
  dropCommand,
  cdCommand,
  setdropchannelCommand,
  colordropCommand,
  commanderdropCommand,
  landdropCommand,
  collectionCommand,
  cardCommand,
  lookupCommand,
  burnCommand,
  bulkburnCommand,
  marketCommand,
  buyCommand,
  giveCommand,
  tradeCommand,
  tagcreateCommand,
  tagdeleteCommand,
  tagrenameCommand,
  tagCommand,
  multitagCommand,
  tagsCommand,
  untagCommand,
  wishaddCommand,
  wishremoveCommand,
  wlCommand,
  toolshopCommand,
  setprefixCommand,
  shortcutCommand,
  setcreatureCommand,
  creaturestatsCommand,
  clashCommand
];
const commandMap = new Collection<string, SlashCommand>();
for (const command of commands) {
  commandMap.set(command.data.name, command);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag}`);
  startBotDropScheduler(client);
  startDropCleanupScheduler();
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

client.on("warn", (message) => {
  console.warn("Discord client warning:", message);
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
      interaction.customId.startsWith(`${MARKET_BUTTON_PREFIX}:`)
    ) {
      await handleMarketPageButton(interaction);
      return;
    }
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(`${CARD_PRINT_PREFIX}:`)
    ) {
      await handleCardPrintButton(interaction);
      return;
    }
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(`${CARD_WISHADD_PREFIX}:`)
    ) {
      await handleCardWishaddButton(interaction);
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
    if (interaction.isButton() && interaction.customId.startsWith(`${BULKBURN_CONFIRM_PREFIX}:`)) {
      await handleBulkBurnConfirmButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith(`${BULKBURN_CANCEL_PREFIX}:`)) {
      await handleBulkBurnCancelButton(interaction);
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
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith(`${CLASH_ACCEPT_PREFIX}:`) ||
        interaction.customId.startsWith(`${CLASH_DECLINE_PREFIX}:`))
    ) {
      await handleClashButtons(interaction);
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

client.on("messageCreate", async (message: Message) => {
  try {
    await handleShortcut(message);
  } catch (error) {
    console.error("Shortcut handler error:", error);
  }
});

async function registerCommandsOnStartup() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const body = commands.map((c) => c.data.toJSON());

  // Always register globally so commands appear in every server the bot joins.
  // Guild-scoped registration (when DISCORD_GUILD_ID was set) only pushed
  // commands to a single server, which is why new servers saw no commands.
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
}

async function bootstrap() {
  await registerCommandsOnStartup();
  await client.login(env.DISCORD_TOKEN);
}

void bootstrap().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});

const shutdown = async () => {
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});
