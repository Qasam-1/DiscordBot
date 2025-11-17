import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ColorResolvable,
  type Guild,
  type InteractionEditReplyOptions,
  type User
} from 'discord.js';
import events from 'events';

import type { DiscordClient } from 'classes/client';

import type { Embed, Message } from 'types/guild';

import { logger } from 'utils/logger';
import { getMessage, updateMessages } from 'db/message';

export class CustomEmbedBuilder extends events {
  private message: Message = {
    content: null,
    embed: {
      color: '#1e1f22',
      description: undefined,
      image: undefined,
      thumbnail: undefined,
      title: undefined,
      url: undefined,
      author: {
        name: undefined,
        url: undefined,
        icon_url: undefined
      },
      footer: {
        text: undefined,
        icon_url: undefined
      },
      fields: []
    }
  };

  constructor(
    public options: {
      interaction: ChatInputCommandInteraction<'cached'>;
      client: DiscordClient;
      message?: Message;
    }
  ) {
    super();
    if (options.message) this.message = options.message;
    if (!options.message?.embed.color) this.message.embed.color = '#1e1f22';
    if (!options.message?.embed.title) this.message.embed.title = '<:Palette:1406000920310845491> Embed Editor';
    if (!options.message?.embed.description)
      this.message.embed.description =
        '> You can edit this embed using the components below, and press **<:Tick:1353102784106336340> Save** when you are done.';
    this.sendEmbedWithOptions();
  }

  private async sendEmbedWithOptions() {
    const interaction = this.options.interaction;
    const user = interaction.user;
    const guild = interaction.guild;

    let embed = new EmbedBuilder();
    if (!isEmptyEmbed(this.message.embed)) embed = getEmbed(user, guild, this.message.embed);

    const message = await interaction
      .editReply({
        content: this.message.content ?? '',
        embeds: [embed],
        components: [...this.getSelection(false), ...this.getButtons(false)]
      })
      .catch((err) => logger.debug({ err }, 'Could not edit message'));
    if (!message) return;

    const collector = message.createMessageComponentCollector({
      idle: 60 * 15 * 1000, // 15 minutes
      filter: (interaction) => interaction.isButton() || interaction.isStringSelectMenu()
    });

    collector.on('end', (_, reason) => {
      if (reason === 'idle') {
        interaction
          .editReply({
            content: this.message.content ?? '',
            embeds: [embed],
            components: [...this.getButtons(true), ...this.getSelection(true)]
          })
          .catch((err) => logger.debug({ err }, 'Could not edit message'));
      }

      // Clean up event listeners to prevent memory leaks
      this.removeAllListeners();
    });

    collector.on('collect', async (selectionInteraction) => {
      if (selectionInteraction.isStringSelectMenu()) {
        switch (selectionInteraction.values[0]) {
          case 'select-custom-message':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setCustomId('modal-custom-message')
                    .setTitle('Edit Content')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Content:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-message')
                          .setStyle(TextInputStyle.Paragraph)
                          .setPlaceholder('Enter the new content for this message...')
                          .setValue(this.message.content ?? '')
                          .setRequired(false)
                          .setMaxLength(2000)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-message',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const input = submitted.fields.getTextInputValue('input-custom-message');
              this.message.content = input;
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-title':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Title')
                    .setCustomId('modal-custom-title')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Title:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-title')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new title for this embed...')
                          .setValue(this.message.embed.title ?? '')
                          .setRequired(false)
                          .setMaxLength(256)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-title',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const title = submitted.fields.getTextInputValue('input-custom-title');
              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, title }, user, guild);
              if (!isValidEmbed) return;
              this.message.embed.title = title;
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-description':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Description')
                    .setCustomId('modal-custom-description')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Description:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-description')
                          .setStyle(TextInputStyle.Paragraph)
                          .setPlaceholder('Enter the new description for this embed...')
                          .setValue(this.message.embed.description ?? '')
                          .setRequired(false)
                          .setMaxLength(4000)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-description',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const input = submitted.fields.getTextInputValue('input-custom-description');
              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, description: input ?? '** **' }, user, guild);
              if (!isValidEmbed) return;
              this.message.embed.description = input;
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-author':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Author')
                    .setCustomId('modal-custom-author')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Author Name:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-name')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new author name for this embed...')
                          .setValue(this.message.embed.author?.name ?? '')
                          .setRequired(false)
                          .setMaxLength(256)
                      ),
                      new LabelBuilder().setLabel('Edit Author Icon:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-icon')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new author icon for this embed...')
                          .setValue(this.message.embed.author?.icon_url ?? '')
                          .setRequired(false)
                          .setMaxLength(4000)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-author',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const name = submitted.fields.getTextInputValue('input-custom-name');
              const icon_url = submitted.fields.getTextInputValue('input-custom-icon');

              let iconurl: string | undefined = icon_url;
              try {
                new URL(icon_url);
              } catch {
                iconurl = undefined;
              }

              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, author: { name, icon_url: iconurl } }, user, guild);
              if (!isValidEmbed) return;
              this.message.embed.author = { name, icon_url: iconurl };
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-footer':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Footer')
                    .setCustomId('modal-custom-footer')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Footer Text:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-text')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new footer text for this embed...')
                          .setValue(this.message.embed.footer?.text ?? '')
                          .setRequired(false)
                          .setMaxLength(256)
                      ),
                      new LabelBuilder().setLabel('Edit Footer Icon:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-icon')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new footer icon for this embed...')
                          .setValue(this.message.embed.footer?.icon_url ?? '')
                          .setRequired(false)
                          .setMaxLength(4000)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-footer',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const text = submitted.fields.getTextInputValue('input-custom-text');
              const icon_url = submitted.fields.getTextInputValue('input-custom-icon');

              let iconurl: string | undefined = icon_url;
              try {
                new URL(icon_url);
              } catch {
                iconurl = undefined;
              }

              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, footer: { text, icon_url: iconurl } }, user, guild);
              if (!isValidEmbed) return;
              this.message.embed.footer = { text, icon_url: iconurl };
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-thumbnail':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Thumbnail')
                    .setCustomId('modal-custom-thumbnail')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Thumbnail:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-thumbnail')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new thumbnail for this embed...')
                          .setValue(this.message.embed.thumbnail ?? '')
                          .setRequired(false)
                          .setMaxLength(4000)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-thumbnail',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const input = submitted.fields.getTextInputValue('input-custom-thumbnail');

              let iconurl: string | undefined = input;
              try {
                new URL(input);
              } catch {
                iconurl = undefined;
              }

              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, thumbnail: iconurl }, user, guild);
              if (!isValidEmbed) return;
              this.message.embed.thumbnail = iconurl;
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-banner':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Banner')
                    .setCustomId('modal-custom-image')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Banner:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-image')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new banner for this embed...')
                          .setValue(this.message.embed.image ?? '')
                          .setRequired(false)
                          .setMaxLength(4000)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-image',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const input = submitted.fields.getTextInputValue('input-custom-image');

              let iconurl: string | undefined = input;
              try {
                new URL(input);
              } catch {
                iconurl = undefined;
              }

              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, image: iconurl }, user, guild);
              if (!isValidEmbed) return;
              this.message.embed.image = iconurl;
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-edit-color':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('custom-embed.editing-embed')
                    .setCustomId('modal-custom-color')
                    .addLabelComponents(
                      new LabelBuilder().setLabel('Edit Color:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-color')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Enter the new color for this embed...')
                          .setValue(this.message.embed.color?.toString() ?? '')
                          .setRequired(false)
                          .setMaxLength(256)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-color',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const input = submitted.fields.getTextInputValue('input-custom-color');
              const hexRegex = /^#(?:[0-9a-fA-F]{3}){2}$/;
              if (!hexRegex.test(input)) this.message.embed.color = '#1e1f22';
              else this.message.embed.color = input;
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;
          case 'select-custom-add-field':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Add Field')
                    .setCustomId('modal-custom-add-field')
                    .addLabelComponents(
                      new LabelBuilder()
                        .setLabel('Edit Field Name:')
                        .setTextInputComponent(
                          new TextInputBuilder()
                            .setCustomId('input-custom-title')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Enter the new field name for this embed...')
                            .setRequired(false)
                            .setMaxLength(256)
                        ),
                      new LabelBuilder()
                        .setLabel('Edit Field Text:')
                        .setTextInputComponent(
                          new TextInputBuilder()
                            .setCustomId('input-custom-text')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Enter the new field text for this embed...')
                            .setRequired(false)
                            .setMaxLength(1024)
                        ),
                      new LabelBuilder()
                        .setLabel('Should field be inline? (Y/N):')
                        .setTextInputComponent(
                          new TextInputBuilder()
                            .setCustomId('input-custom-inline')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Should the field be inline? (Y/N)')
                            .setRequired(false)
                            .setMaxLength(5)
                        )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));
              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-add-field',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));
              if (!submitted) return;
              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              const name = submitted.fields.getTextInputValue('input-custom-title');
              const value = submitted.fields.getTextInputValue('input-custom-text');
              const inlineInput = submitted.fields.getTextInputValue('input-custom-inline');

              // Better inline parsing
              const inline = ['y', 'yes', 'true', '1'].includes(inlineInput.toLowerCase().trim());

              const isValidEmbed = this.isValidEmbed(
                { ...this.message.embed, fields: [...(this.message.embed.fields || []), { name, value, inline }] },
                user,
                guild
              );
              if (!isValidEmbed) return;

              if (!this.message.embed.fields) this.message.embed.fields = [];
              this.message.embed.fields.push({ name, value, inline });
              await submitted.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;

          case 'select-custom-edit-field':
            {
              if (!this.message.embed.fields || this.message.embed.fields.length === 0) {
                await selectionInteraction
                  .reply({
                    embeds: [new EmbedBuilder().setDescription('<:Fail:1354511452894921037> There are no fields on this embed.').setColor('#FF6666')],
                    flags: [MessageFlags.Ephemeral]
                  })
                  .catch((err) => logger.debug({ err }, 'Could not send reply'));
                return;
              }

              if (
                !(await selectionInteraction
                  .reply({
                    components: [
                      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                        new StringSelectMenuBuilder()
                          .setCustomId('select-field-to-edit')
                          .setPlaceholder('Select a field...')
                          .addOptions(
                            this.message.embed.fields.map((field, index) => ({
                              label: field.name.substring(0, 100) || `Field ${index + 1}`,
                              description: field.value.substring(0, 100) || 'No description',
                              emoji: '<:Pencil:1366458755323002892>',
                              value: index.toString()
                            }))
                          )
                      )
                    ],
                    flags: [MessageFlags.Ephemeral]
                  })
                  .catch((err) => logger.debug({ err }, 'Could not send select menu')))
              )
                return;

              const fieldSelection = await selectionInteraction.channel
                ?.awaitMessageComponent({
                  filter: (int) => int.customId === 'select-field-to-edit' && int.user.id === user.id,
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await field selection'));

              if (!fieldSelection || !fieldSelection.isStringSelectMenu()) return;

              const fieldIndex = parseInt(fieldSelection.values[0]);
              const selectedField = this.message.embed.fields[fieldIndex];

              await fieldSelection
                .showModal(
                  new ModalBuilder()
                    .setTitle('Edit Field')
                    .setCustomId('modal-custom-edit-field')
                    .addLabelComponents(
                      new LabelBuilder()
                        .setLabel('Edit Field Name:')
                        .setTextInputComponent(
                          new TextInputBuilder()
                            .setCustomId('input-custom-title')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Enter the field name for this embed...')
                            .setValue(selectedField.name)
                            .setRequired(false)
                            .setMaxLength(256)
                        ),
                      new LabelBuilder()
                        .setLabel('Edit Field Text:')
                        .setTextInputComponent(
                          new TextInputBuilder()
                            .setCustomId('input-custom-text')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Enter the field text for this embed...')
                            .setValue(selectedField.value)
                            .setRequired(false)
                            .setMaxLength(1024)
                        ),
                      new LabelBuilder().setLabel('Edit Field Inline:').setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId('input-custom-inline')
                          .setStyle(TextInputStyle.Short)
                          .setPlaceholder('Should the field be inline? (Y/N)')
                          .setValue(selectedField.inline ? 'Yes' : 'No')
                          .setRequired(false)
                          .setMaxLength(5)
                      )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));

              const submitted = await fieldSelection
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-edit-field',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));

              if (!submitted) return;

              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));

              await selectionInteraction.deleteReply().catch((err) => logger.debug({ err }, 'Could not delete select menu message'));

              const name = submitted.fields.getTextInputValue('input-custom-title');
              const value = submitted.fields.getTextInputValue('input-custom-text');
              const inline = submitted.fields.getTextInputValue('input-custom-inline');

              const updatedFields = [...this.message.embed.fields];
              updatedFields[fieldIndex] = {
                name,
                value,
                inline: ['y', 'yes', 'true'].includes(inline.toLowerCase())
              };

              const isValidEmbed = this.isValidEmbed({ ...this.message.embed, fields: updatedFields }, user, guild);

              if (!isValidEmbed) return;

              this.message.embed.fields[fieldIndex] = {
                name,
                value,
                inline: ['y', 'yes', 'true'].includes(inline.toLowerCase())
              };

              await interaction.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;

          case 'select-custom-remove-field':
            {
              if (!this.message.embed.fields || this.message.embed.fields.length === 0) {
                await selectionInteraction
                  .reply({
                    embeds: [new EmbedBuilder().setDescription('<:Fail:1354511452894921037> There are no fields on this embed.').setColor('#FF6666')],
                    flags: [MessageFlags.Ephemeral]
                  })
                  .catch((err) => logger.debug({ err }, 'Could not send reply'));
                return;
              }

              await selectionInteraction
                .reply({
                  components: [
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                      new StringSelectMenuBuilder()
                        .setCustomId('select-field-to-delete')
                        .setPlaceholder('Select a field...')
                        .addOptions(
                          this.message.embed.fields.map((field, index) => ({
                            label: field.name.substring(0, 100) || `Field ${index + 1}`,
                            description: field.value.substring(0, 100) || 'No description',
                            emoji: '<:Trash:1385731530793681049>',
                            value: index.toString()
                          }))
                        )
                    )
                  ],
                  flags: [MessageFlags.Ephemeral]
                })
                .catch((err) => logger.debug({ err }, 'Could not send select menu'));

              const fieldSelection = await selectionInteraction.channel
                ?.awaitMessageComponent({
                  filter: (int) => int.customId === 'select-field-to-delete' && int.user.id === user.id,
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await field selection'));

              if (!fieldSelection || !fieldSelection.isStringSelectMenu()) return;

              const fieldIndex = parseInt(fieldSelection.values[0]);

              await fieldSelection.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              this.message.embed.fields.splice(fieldIndex, 1);
              await selectionInteraction.deleteReply().catch((err) => logger.debug({ err }, 'Could not delete select menu message'));
              await interaction.editReply(this.getMessage(user, guild)).catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;

          case 'select-custom-import':
            {
              await selectionInteraction
                .showModal(
                  new ModalBuilder()
                    .setTitle('Import Message from Exported Code')
                    .setCustomId('modal-custom-import')
                    .addLabelComponents(
                      new LabelBuilder()
                        .setLabel('Exportable Code:')
                        .setTextInputComponent(
                          new TextInputBuilder()
                            .setCustomId('input-custom-import')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Enter the exportable code to import the message from...')
                            .setRequired(false)
                            .setMaxLength(2000)
                        )
                    )
                )
                .catch((err) => logger.debug({ err }, 'Could not show modal'));

              const submitted = await selectionInteraction
                .awaitModalSubmit({
                  filter: (int) => int.customId === 'modal-custom-import',
                  time: 60 * 15 * 1000
                })
                .catch((err) => logger.debug({ err }, 'Could not await modal submit'));

              if (!submitted) return;

              const input = submitted.fields.getTextInputValue('input-custom-import');
              const msg = await getMessage(input);

              if (!msg?.message) {
                await submitted
                  .reply({
                    embeds: [new EmbedBuilder().setDescription('<:Fail:1354511452894921037> Invalid export code provided.').setColor('#FF6666')],
                    flags: [MessageFlags.Ephemeral]
                  })
                  .catch((err) => logger.debug({ err }, 'Could not send reply'));
                return;
              }
              this.message = msg.message;

              await submitted.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
              await interaction
                .editReply({
                  content: this.message.content ?? '',
                  embeds: [getEmbed(user, guild, this.message.embed)],
                  components: [...this.getSelection(false), ...this.getButtons(false)]
                })
                .catch((err) => logger.debug({ err }, 'Could not edit reply'));
            }
            break;

          case 'select-custom-export':
            {
              const customId = `puffer_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 15)}`.substring(0, 29);

              await updateMessages(customId, user.id, this.message as any);

              await selectionInteraction
                .reply({
                  embeds: [
                    new EmbedBuilder()
                      .setDescription(
                        `<:Success:1354511612974989484> Your message has been exported successfully! Here's your exportable code:\n\`\`\`${customId}\`\`\`\n-# You can share this code with other people for them to import your message.`
                      )
                      .setColor('#66FF66')
                  ],
                  flags: [MessageFlags.Ephemeral]
                })
                .catch((err) => logger.debug({ err }, 'Could not send message'));
            }
            break;
        }
      }
    });

    collector.on('collect', async (buttonInteraction) => {
      if (!buttonInteraction.isButton()) return;

      switch (buttonInteraction.customId) {
        case 'button-custom-save':
          {
            this.emit('submit', this.message, buttonInteraction);
            collector.stop();
          }
          break;
        case 'button-custom-delete':
          {
            await buttonInteraction.deferUpdate().catch((err) => logger.debug({ err }, 'Could not defer update'));
            await buttonInteraction.deleteReply().catch((err) => logger.debug({ err }, 'Could not delete reply'));
            collector.stop();
          }
          break;
      }
    });
  }
  private isValidEmbed(embedData: Embed, user: User, guild: Guild) {
    try {
      const embed = getEmbed(user, guild, embedData);
      if (embed) return true;
      else return false;
    } catch (err) {
      logger.debug({ err }, 'Could not validate embed');
      return false;
    }
  }
  private getMessage(user: User, guild: Guild): InteractionEditReplyOptions {
    const embedData = this.message.embed;
    if (isEmptyEmbed(embedData)) {
      this.message.embed.title = '<:Palette:1406000920310845491> Embed Editor';
      this.message.embed.description = '> You can edit this embed using the components below, and press **<:Tick:1353102784106336340> Save** when you are done.';
    }
    return {
      content: this.message.content ?? '',
      embeds: [getEmbed(user, guild, this.message.embed)]
    };
  }
  private getSelection(disabled: boolean = false) {
    return [
      new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select-custom-embed')
          .setPlaceholder('Edit a property...')
          .setMaxValues(1)
          .setMinValues(0)
          .setDisabled(disabled)
          .addOptions([
            {
              label: 'Edit Content',
              value: 'select-custom-message',
              emoji: '<:Text:1353105462349795429>'
            },
            {
              label: 'Edit Title',
              value: 'select-custom-title',
              emoji: '<:Text:1353105462349795429>'
            },
            {
              label: 'Edit Description',
              value: 'select-custom-description',
              emoji: '<:Text:1353105462349795429>'
            },
            {
              label: 'Edit Author',
              value: 'select-custom-author',
              emoji: '<:Text:1353105462349795429>'
            },
            {
              label: 'Edit Footer',
              value: 'select-custom-footer',
              emoji: '<:Text:1353105462349795429>'
            },
            {
              label: 'Edit Thumbnail',
              value: 'select-custom-thumbnail',
              emoji: '<:Portrait:1406752043481432194>'
            },
            {
              label: 'Edit Banner',
              value: 'select-custom-banner',
              emoji: '<:Portrait:1406752043481432194>'
            },
            {
              label: 'Add Field',
              value: 'select-custom-add-field',
              emoji: '<:Field:1375571559049334884>'
            },
            {
              label: 'Edit Field',
              value: 'select-custom-edit-field',
              emoji: '<:Field:1375571559049334884>'
            },
            {
              label: 'Remove Field',
              value: 'select-custom-remove-field',
              emoji: '<:Field:1375571559049334884>'
            },
            {
              label: 'Edit Color',
              value: 'select-custom-edit-color',
              emoji: '<:Brush:1406753343887511585>'
            },
            {
              label: 'Import',
              value: 'select-custom-import',
              emoji: '<:Import:1407043900304130079>'
            },
            {
              label: 'Export',
              value: 'select-custom-export',
              emoji: '<:Export:1407043940183445625>'
            }
          ])
      )
    ];
  }
  private getButtons(disabled: boolean = false) {
    return [
      new ActionRowBuilder<ButtonBuilder>().setComponents(
        new ButtonBuilder()
          .setCustomId('button-custom-save')
          .setLabel('Save')
          .setEmoji('<:Tick:1353102784106336340>')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('button-custom-delete')
          .setLabel('Delete')
          .setEmoji('<:Trash:1385731530793681049>')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setLabel('Documentation')
          .setEmoji('<:Book:1439374172563308687>')
          .setStyle(ButtonStyle.Link)
          .setURL('https://discordstatus.com/')
          .setDisabled(disabled)
      )
    ];
  }
}
// not in use currently, but might be useful later
export function replacePlaceholders(string: string = '', user: User, guild: Guild) {
  return string
    .replace(/{user}/g, user.toString())
    .replace(/{user.mention}/g, user.toString())
    .replace(/{user.username}/g, user.username)
    .replace(/{user.id}/g, user.id)
    .replace(/{user.avatar}/g, user.displayAvatarURL())
    .replace(/{server}/g, guild.name)
    .replace(/{server.name}/g, guild.name)
    .replace(/{server.id}/g, guild.id)
    .replace(/{server.icon}/g, guild.iconURL() || '')
    .replace(/{server.member_count}/g, guild.memberCount.toString())
    .replace(/{guild}/g, guild.name)
    .replace(/{guild.name}/g, guild.name)
    .replace(/{guild.id}/g, guild.id)
    .replace(/{guild.icon}/g, guild.iconURL() || '')
    .replace(/{guild.member_count}/g, guild.memberCount.toString());
}
export function isEmptyEmbed(embedData: Embed) {
  if (
    !embedData.title?.length &&
    !embedData.fields?.length &&
    !embedData.description?.length &&
    !embedData.author?.name?.length &&
    !embedData.footer?.text?.length
  )
    return true;
  else return false;
}
export function getEmbed(user: User, guild: Guild, embed: Embed): EmbedBuilder {
  return new EmbedBuilder({
    description: embed.description ?? '',
    title: embed.title ?? '',
    author: {
      name: embed.author?.name ?? '',
      icon_url: embed.author?.icon_url ?? '',
      url: embed.author?.url ?? ''
    },
    fields: embed.fields?.map((field) => ({
      name: field.name ?? '',
      value: field.value ?? '',
      inline: field.inline ?? false
    })),
    footer: {
      text: embed.footer?.text ?? '',
      icon_url: embed.footer?.icon_url ?? ''
    },
    image: {
      url: embed.image ?? ''
    },
    thumbnail: {
      url: embed.thumbnail ?? ''
    },
    url: embed.url ?? ''
  }).setColor(embed.color as ColorResolvable);
}
