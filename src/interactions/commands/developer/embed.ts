import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/command';

import { ModuleType } from 'types/interactions';

import { CustomEmbedBuilder } from 'classes/custom-embed';
import { logger } from 'utils/logger';

export default new Command({
  module: ModuleType.General,
  botPermissions: ['SendMessages'],
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Shows you roundtrip and websocket heartbeat latency')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.PrivateChannel, InteractionContextType.BotDM),
  async execute({ interaction, client, lng }) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'This command can only be used in servers.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    await interaction.deferReply({ flags: [] });

    const customBuilder = new CustomEmbedBuilder({
      client,
      interaction: interaction
    });

    customBuilder.once('submit', async (data, interaction) => {
      logger.debug(data, 'Embed data:');

      await interaction.deferUpdate();
      await interaction.deleteReply();
    });
  }
});
