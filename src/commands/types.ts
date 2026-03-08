import type { ChatInputCommandInteraction } from "discord.js";

export type SlashCommand = {
  data: {
    name: string;
    toJSON: () => object;
  };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
