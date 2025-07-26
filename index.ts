import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageFlags,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

type Message = {
  content?: string;
  attachments?: { url: string }[];
};

let savedMessages: {
  userId: string;
  messages: Message[];
}[] = [];

try {
  savedMessages = (await Bun.file(
    './savedMessages.json',
  ).json()) as typeof savedMessages;
} catch (error) {
  console.warn('Failed to load saved messages:', error);
} finally {
  if (!Array.isArray(savedMessages)) savedMessages = [];
}
const commands = [
  new ContextMenuCommandBuilder()
    .setName('sendToDM')
    .setType(ApplicationCommandType.Message)
    .setNameLocalizations({ 'zh-TW': '轉發至私訊', 'en-US': 'Forward to DM' }),
  new ContextMenuCommandBuilder()
    .setName('temporarilyStoreMergedMessage')
    .setType(ApplicationCommandType.Message)
    .setNameLocalizations({
      'zh-TW': '暫存合併訊息',
      'en-US': 'Temporarily Store Merged Message',
    }),
  new ContextMenuCommandBuilder()
    .setName('mergeAndSendMessage')
    .setType(ApplicationCommandType.Message)
    .setNameLocalizations({
      'zh-TW': '合併並發送訊息',
      'en-US': 'Merge and Send Message',
    }),
];

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isMessageContextMenuCommand()) {
      const commandName = interaction.commandName;
      let messageURL;
      switch (commandName) {
        case 'sendToDM': {
          const targetMessage = interaction.targetMessage;
          const components = [
            targetMessage.content
              ? new TextDisplayBuilder().setContent(targetMessage.content)
              : null,
            new ContainerBuilder().addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                targetMessage.attachments.map((attachment) =>
                  new MediaGalleryItemBuilder().setURL(attachment.url),
                ),
              ),
            ),
          ].filter(
            (component): component is NonNullable<typeof component> =>
              component !== null,
          );
          const resendMessage = await interaction.user.send({
            components: components,
            flags: MessageFlags.IsComponentsV2,
          });
          messageURL = resendMessage.url;

          await interaction.reply({
            content: `${messageURL}`,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }
        case 'temporarilyStoreMergedMessage': {
          const targetMessage = interaction.targetMessage;
          let userData = savedMessages.find(
            (data) => data.userId === interaction.user.id,
          );
          if (!userData) {
            userData = { userId: interaction.user.id, messages: [] };
            savedMessages.push(userData);
          }
          userData.messages.push({
            content: targetMessage.content,
            attachments: targetMessage.attachments.map((attachment) => ({
              url: attachment.url,
            })),
          });
          await interaction.reply({
            content: `Save Message, Current Messages:${userData.messages.length}`,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }
        case 'mergeAndSendMessage': {
          const targetMessage = interaction.targetMessage;
          let userData = savedMessages.find(
            (data) => data.userId === interaction.user.id,
          );
          if (!userData) {
            await interaction.reply({
              content: 'No messages stored for merging.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          const messageTexts = userData.messages.map((msg) => msg.content);
          const attachments = userData.messages
            .flatMap((msg) => msg.attachments || [])
            .map((attachment) => attachment.url);

          const component = new ContainerBuilder();
          const textContents = [targetMessage.content, ...messageTexts].filter(
            (text): text is NonNullable<typeof text> =>
              !!text && text !== null && text.length > 1,
          );
          if (textContents.length > 0) {
            component.addTextDisplayComponents(
              textContents.map((text) =>
                new TextDisplayBuilder().setContent(text),
              ),
            );
          }
          const urls = [
            ...attachments,
            ...targetMessage.attachments.map((attachment) => attachment.url),
          ];

          if (textContents.length > 1 && urls.length > 1) {
            component.addSeparatorComponents(
              new SeparatorBuilder({
                divider: false,
                spacing: SeparatorSpacingSize.Small,
              }),
            );
          }

          if (urls.length > 1)
            component.addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                [
                  ...attachments,
                  ...targetMessage.attachments.map(
                    (attachment) => attachment.url,
                  ),
                ].map((url) => new MediaGalleryItemBuilder().setURL(url)),
              ),
            );

          const mergedMessage = await interaction.user.send({
            components: [component],
            flags: MessageFlags.IsComponentsV2,
          });
          messageURL = mergedMessage.url;
          userData.messages = []; // Clear stored messages after sending
          await interaction.reply({
            content: `${messageURL}`,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

const rest = new REST().setToken(process.env.CLIENT_TOKEN || '');

await rest.put(Routes.applicationCommands(process.env.CLIENT_ID || ''), {
  body: commands.map((command) => command.toJSON()),
});

await client.login(process.env.CLIENT_TOKEN || '');

async function exitHandler() {
  const file = Bun.file('./savedMessages.json').writer();
  file.write(JSON.stringify(savedMessages));
  await client.destroy();
}

process.on('SIGINT', async () => {
  await exitHandler();
  process.exit(0);
});

process.on('beforeExit', async () => {
  await exitHandler();
});
