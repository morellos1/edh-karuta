import { REST, Routes } from "discord.js";
import { env } from "../src/config.js";
import { dropCommand } from "../src/commands/drop.js";
import { cdCommand } from "../src/commands/cd.js";
import { setdropchannelCommand } from "../src/commands/setdropchannel.js";
import { colordropCommand } from "../src/commands/colordrop.js";
import { commanderdropCommand } from "../src/commands/commanderdrop.js";
import { collectionCommand } from "../src/commands/collection.js";
import { cardCommand } from "../src/commands/card.js";
import { lookupCommand } from "../src/commands/lookup.js";
import { burnCommand } from "../src/commands/burn.js";
import { marketCommand } from "../src/commands/market.js";
import { buyCommand } from "../src/commands/buy.js";
import { giveCommand } from "../src/commands/give.js";
import { tradeCommand } from "../src/commands/trade.js";
import { tagcreateCommand } from "../src/commands/tagcreate.js";
import { tagdeleteCommand } from "../src/commands/tagdelete.js";
import { tagrenameCommand } from "../src/commands/tagrename.js";
import { tagCommand } from "../src/commands/tag.js";
import { tagsCommand } from "../src/commands/tags.js";
import { untagCommand } from "../src/commands/untag.js";
import { wishaddCommand } from "../src/commands/wishadd.js";
import { wishremoveCommand } from "../src/commands/wishremove.js";
import { wlCommand } from "../src/commands/wl.js";

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

async function main() {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  if (env.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body });
    console.log(`Registered ${body.length} slash commands to guild ${env.DISCORD_GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
    console.log(`Registered ${body.length} slash commands globally.`);
  }
}

void main();
