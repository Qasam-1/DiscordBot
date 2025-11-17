import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, PermissionFlagsBits, Embed, EmbedBuilder } from 'discord.js';

import { Command } from 'classes/command';

import { ModuleType } from 'types/interactions';

import { CustomEmbedBuilder, getEmbed } from 'classes/custom-embed';
import { logger } from 'utils/logger';

export default new Command({
  module: ModuleType.General,
  cooldown: 30_000,
  botPermissions: ['Administrator'],
  data: new SlashCommandBuilder()
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('embed')
    .setDescription('Open an Embed Builder where you can create/edit embeds!'),
  async execute({ interaction, client }) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`${client.customEmojis.Fail} This command can only be ran in a guild!`).setColor('#FF6666')],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const customBuilder = new CustomEmbedBuilder({
      client,
      interaction: interaction
    });

    customBuilder.once('submit', async (data, interaction) => {
      await interaction.deferUpdate();
      await interaction.deleteReply();

      const msg: any = { embeds: [getEmbed(interaction.user, interaction.guild, data.embed)] };
      if (data.content) msg.content = data.content;

      await interaction.channel?.send(msg).catch((err: any) => logger.debug({ err }, 'Could not edit message'));
    });
  }
});
