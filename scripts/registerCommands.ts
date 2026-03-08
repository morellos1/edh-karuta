import { REST, Routes } from "discord.js";
import { env } from "../src/config.js";
import { dropCommand } from "../src/commands/drop.js";
import { collectionCommand } from "../src/commands/collection.js";
import { cardCommand } from "../src/commands/card.js";
import { lookupCommand } from "../src/commands/lookup.js";

async function main() {
  const commands = [
    dropCommand.data,
    collectionCommand.data,
    cardCommand.data,
    lookupCommand.data
  ].map((cmd) => cmd.toJSON());
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
    body: commands
  });
  console.log("Slash commands registered.");
}

void main();
