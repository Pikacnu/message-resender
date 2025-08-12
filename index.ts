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
  AttachmentBuilder,
  ComponentType,
} from 'discord.js';

import {
  createCanvas,
  Image,
  GlobalFonts,
  loadImage,
  type CanvasRenderingContext2D,
} from '@napi-rs/canvas';

import { supportedLanguages, generateImage } from './codeblock';

import { join } from 'path';
import type { BundledLanguage } from 'shiki';

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

// Load custom fonts
GlobalFonts.registerFromPath(
  join(import.meta.dir, 'assets', 'fonts', 'FiraCodeNerdFont-Regular.ttf'),
  'FiraCodeNerdFont',
);
GlobalFonts.registerFromPath(
  join(import.meta.dir, 'assets', 'fonts', 'SixHandsMarker.ttf'),
  'Six Hands Marker',
);
GlobalFonts.registerFromPath(
  join(import.meta.dir, 'assets', 'fonts', '微軟正黑體.ttf'),
  'Microsoft JhengHei',
);
GlobalFonts.registerFromPath(
  join(import.meta.dir, 'assets', 'fonts', 'NotoSansCJKtc-Regular.ttf'),
  'Noto Sans CJK TC',
);

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
  new ContextMenuCommandBuilder()
    .setName('combineCurrentMessageImages')
    .setType(ApplicationCommandType.Message)
    .setNameLocalizations({
      'zh-TW': '合併當前訊息圖片',
      'en-US': "Combine Current Message's Images",
    }),
  new ContextMenuCommandBuilder()
    .setName('quoteItWhyNot')
    .setType(ApplicationCommandType.Message)
    .setNameLocalizations({
      'zh-TW': '引用它，為什麼不呢',
      'en-US': 'Quote It Why Not',
    }),
];

const canvasWidth = 700;
const avatarSize = 110; // px
const avatarPadding = 20; // px
const font =
  '16px "FiraCodeNerdFont", "Six Hands Marker", "Microsoft JhengHei", "Noto Sans CJK TC"';
const lineHeight = 32; // px
const maxTextWidth = canvasWidth - avatarSize - avatarPadding * 2 - 10; // 10px for padding after avatar

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
          if (targetMessage.components.length > 0) {
            userData.messages.push({
              content: targetMessage.components
                .map((component) => component.toJSON())
                .join('\n'),
              attachments: targetMessage.components
                .filter(
                  (component) => component.type === ComponentType.MediaGallery,
                )
                .flatMap((component) =>
                  component.items.map((item) => ({
                    url: item.media.url,
                  })),
                ),
            });
          }
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
            ...targetMessage.components
              .filter(
                (component) => component.type === ComponentType.MediaGallery,
              )
              .flatMap((component) =>
                component.items.map((item) => item.media.url),
              ),
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
        case 'combineCurrentMessageImages': {
          const targetMessage = interaction.targetMessage;
          const imageUrls = [
            ...targetMessage.attachments.map((attachment) => attachment.url),
            ...targetMessage.components
              .filter(
                (component) => component.type === ComponentType.MediaGallery,
              )
              .flatMap((component) =>
                component.items.map((item) => item.media.url),
              ),
          ];

          if (imageUrls.length <= 1) {
            await interaction.reply({
              content: 'Not enough images to combine. (2 required)',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await interaction.reply({
            content: `Generating combined image...`,
            flags: MessageFlags.Ephemeral,
          });
          //assets set up
          const urlImageEntries: [string, Image][] = await Promise.all(
            imageUrls.map(async (url) => [
              url,
              await loadImage(url).then((img) => img as Image),
            ]),
          );
          let singleImageMaxWidth = 0;
          let singleImageMaxHeight = 0;
          urlImageEntries.forEach(([_, img]) => {
            if (img.width > singleImageMaxWidth)
              singleImageMaxWidth = img.width;
            if (img.height > singleImageMaxHeight)
              singleImageMaxHeight = img.height;
          });
          const gridSize = Math.ceil(Math.sqrt(urlImageEntries.length));
          const gridLike = Array.from({ length: gridSize }, (_, colIndex) =>
            Array.from(
              { length: gridSize },
              (_, rowIndex) =>
                colIndex * gridSize + rowIndex < urlImageEntries.length,
            ).filter(Boolean),
          ).filter((row) => row.length > 0);

          const maxWidth = singleImageMaxWidth * gridLike.length;
          const maxHeight = singleImageMaxHeight * (gridLike[0]?.length ?? 0);
          const urlImageMap: Record<string, Image> =
            Object.fromEntries(urlImageEntries);
          const canvas = createCanvas(maxWidth, maxHeight);
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, maxWidth, maxHeight);
          let xOffset = 0;
          let yOffset = 0;
          for (const [, img] of Object.entries(urlImageMap)) {
            const currentImageWidth = img.width;
            const currentImageHeight = img.height;
            ctx.drawImage(
              img,
              xOffset + (singleImageMaxWidth - currentImageWidth) / 2,
              yOffset + (singleImageMaxHeight - currentImageHeight) / 2,
              currentImageWidth,
              currentImageHeight,
            );
            xOffset += singleImageMaxWidth;
            if (xOffset >= maxWidth) {
              xOffset = 0;
              yOffset += singleImageMaxHeight;
            }
          }
          const combinedImage = canvas.toBuffer('image/webp');
          const attachment = new AttachmentBuilder(combinedImage, {
            name: 'combined_image.webp',
          });
          const combinedMessage = await interaction.user.send({
            files: [attachment],
          });
          messageURL = combinedMessage.url;
          await interaction.editReply({
            content: `Combined image sent: ${messageURL}`,
          });
          break;
        }
        case 'quoteItWhyNot': {
          const targetMessage = interaction.targetMessage;
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          // get message and remove markdown formatting
          const message = targetMessage.content
            .replaceAll('-#', '')
            .replaceAll('__', '')
            .replaceAll('~~', '')
            .replaceAll('**', '');

          const avatarURL = targetMessage.author.displayAvatarURL({
            size: 512,
            extension: 'webp',
          });
          const avatarImage = await loadImage(avatarURL);
          //how to predict the size of the canvas?
          if (!message || !avatarImage) {
            await interaction.reply({
              content: 'Message or avatar image not found.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const measureCanvas = createCanvas(1, 1);
          const measureCtx = measureCanvas.getContext('2d');
          measureCtx.font = font;
          // 中文（CJK）通常沒有空格，原本的 wrapText 只會在空白處換行，對中文不友善。
          // 改良：遇到中文字時，逐字測量，遇到英文仍以單詞為單位。
          async function wrapText(
            ctx: CanvasRenderingContext2D,
            text: string,
            maxWidth: number,
          ): Promise<[string[], [string, number, number][]]> {
            const lines: string[] = [];
            const codeBlocks: [string, number, number][] = [];
            const codeBlockRegex = new RegExp(
              '```(' +
                supportedLanguages.reverse().join('|') +
                ')?([\\s\\S]*?)```|`([^`]+)`',
              'g',
            );
            let match;

            while ((match = codeBlockRegex.exec(text)) !== null) {
              const lang = match[1] || 'plaintext';
              const code = match[2] || match[3] || '';
              const [codeImage, codeImageWidth, codeImageHeight] =
                await generateImage({
                  code,
                  lang: lang as BundledLanguage,
                  width: maxWidth,
                  backgroundColor: '#ffffff00',
                });
              codeBlocks.push([codeImage, codeImageWidth, codeImageHeight]);
            }
            text = text.replace(codeBlockRegex, '\n<CodeBlock>\n');

            for (const rawLine of text.split('\n')) {
              let line = '';
              let buffer = '';
              for (let i = 0; i < rawLine.length; i++) {
                const char = rawLine[i] || '';
                // 判斷是否為 CJK 字元
                if (
                  /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uff00-\uffef]/.test(
                    char,
                  )
                ) {
                  // 先處理 buffer（英文單詞）
                  if (buffer) {
                    const testLine = line + buffer;
                    if (
                      ctx.measureText(testLine).width > maxWidth &&
                      line !== ''
                    ) {
                      lines.push(line);
                      line = buffer;
                    } else {
                      line = testLine;
                    }
                    buffer = '';
                  }
                  // 處理單一中文字
                  const testLine = line + char;
                  if (
                    ctx.measureText(testLine).width > maxWidth &&
                    line !== ''
                  ) {
                    lines.push(line);
                    line = char;
                  } else {
                    line = testLine;
                  }
                } else if (char === ' ' || char === '\t') {
                  buffer += char;
                } else {
                  buffer += char;
                  // 如果下個字是 CJK 或結尾，則處理 buffer
                  const nextChar = rawLine[i + 1];
                  if (
                    !nextChar ||
                    /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uff00-\uffef]/.test(
                      nextChar,
                    ) ||
                    nextChar === ' ' ||
                    nextChar === '\t'
                  ) {
                    const testLine = line + buffer;
                    if (
                      ctx.measureText(testLine).width > maxWidth &&
                      line !== ''
                    ) {
                      lines.push(line);
                      line = buffer;
                    } else {
                      line = testLine;
                    }
                    buffer = '';
                  }
                }
              }
              if (buffer) {
                const testLine = line + buffer;
                if (ctx.measureText(testLine).width > maxWidth && line !== '') {
                  lines.push(line);
                  line = buffer;
                } else {
                  line = testLine;
                }
                buffer = '';
              }
              lines.push(line);
            }
            return [lines, codeBlocks];
          }

          const [wrappedLines, codeBlocks] = await wrapText(
            measureCtx,
            message,
            maxTextWidth,
          );

          const canvasHeight = Math.max(
            avatarPadding * 2 + avatarSize + 120, // 120px for text
            wrappedLines.length * lineHeight +
              codeBlocks.reduce((acc, block) => acc + block[2], 0) +
              40, // 40px for padding and spacing
          );

          const isSmallerThanRequiredHeight =
            canvasHeight === avatarPadding * 2 + avatarSize + 120;

          const canvas = createCanvas(canvasWidth, canvasHeight);

          const ctx = canvas.getContext('2d');

          ctx.fillStyle = '#ffffff0f';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.beginPath();

          const avatarRadius = avatarSize / 2;
          const avatarX = avatarPadding + avatarRadius;
          const avatarY = avatarPadding + avatarRadius;
          const afterAvatar = avatarPadding * 2 + avatarSize;
          ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);

          ctx.clip();
          ctx.drawImage(
            avatarImage,
            avatarPadding,
            avatarPadding,
            avatarSize,
            avatarSize,
          );
          ctx.restore();
          ctx.font = font;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(
            targetMessage.author.displayName || '',
            (avatarPadding * 2 + avatarSize) / 2 -
              measureCtx.measureText(targetMessage.author.displayName || '')
                .width /
                2,
            avatarPadding * 2 + avatarSize,
            avatarPadding + avatarSize,
          );
          // Set text alignment and baseline
          let y = 40;
          let fontSize = Math.max(
            16,
            Math.min(
              Math.floor((canvasHeight - 40) / wrappedLines.length),
              Math.floor(
                (canvasWidth - (avatarPadding * 2 + avatarSize)) /
                  wrappedLines.reduce(
                    (acc, line) => Math.max(acc, line.length),
                    0,
                  ),
              ),
            ),
          );
          if (isSmallerThanRequiredHeight) {
            ctx.textBaseline = 'top';
            ctx.textAlign = 'center';
            y =
              canvasHeight / 2 -
              (wrappedLines.length * Math.max(fontSize, lineHeight)) / 2;
            ctx.font = font.replace('16px', `${fontSize}px`);
            measureCtx.font = ctx.font;
          }
          const defaultX = isSmallerThanRequiredHeight
            ? avatarPadding * 2 + avatarSize + (canvasWidth - afterAvatar) / 2
            : afterAvatar;
          for (let line of wrappedLines) {
            // code block support
            if (line.startsWith('<CodeBlock>')) {
              const codeBlock = codeBlocks.shift();
              if (!codeBlock) continue;
              const [codeImage, codeImageWidth, codeImageHeight] = codeBlock;
              const codeImageObj = await loadImage(codeImage);
              ctx.drawImage(
                codeImageObj,
                afterAvatar,
                y - avatarSize,
                codeImageWidth,
                codeImageHeight,
              );
              y += codeImageHeight - avatarSize; // Adjust y position after code block
              continue;
            }
            // emoji support
            const emojiRegex = /<:[A-Za-z0-9_]+:(\d+)>/g;
            const emojiList: [string, string][] = [];
            const lineWithEmojis = line.replace(emojiRegex, (match, p1) => {
              emojiList.push([match, p1]);
              return '<EMOJI>';
            });
            if (emojiList.length > 0) {
              const emojiImages: [string, Image][] = (
                await Promise.all(
                  emojiList.map(async ([emoji, id]) => {
                    return await loadImage(
                      `https://cdn.discordapp.com/emojis/${id}.png`,
                    ).then((img) => [emoji, img] as [string, Image]);
                  }),
                )
              ).filter((item): item is [string, Image] => item !== null);
              // Draw the text with emojis
              const segmentsWithoutEmojis = lineWithEmojis.split('<EMOJI>');
              let x = defaultX; // Start after the avatar
              for (let i = 0; i < segmentsWithoutEmojis.length; i++) {
                const segment = segmentsWithoutEmojis[i];
                if (segment) {
                  ctx.fillText(segment, x, y, maxTextWidth);
                  x += measureCtx.measureText(segment).width;
                }
                if (i < emojiImages.length && emojiImages[i]) {
                  const emojiImage = emojiImages[i];
                  if (emojiImage) {
                    const [, img] = emojiImage;
                    ctx.drawImage(img, x, y - fontSize, fontSize, fontSize); // Draw emoji
                    x += fontSize; // Move x position after emoji
                  }
                }
              }
            } else {
              ctx.fillText(line, defaultX, y, maxTextWidth);
            }

            y += fontSize * 2;
          }
          const pad = (n: number) => n.toString().padStart(2, '0');
          const formatDateTime = (date: Date) => {
            const y = date.getFullYear();
            const m = pad(date.getMonth() + 1);
            const d = pad(date.getDate());
            const h = pad(date.getHours());
            const min = pad(date.getMinutes());
            return `${y}-${m}-${d} ${h}:${min}`;
          };
          const infoMessage = [
            `From #${targetMessage.author.globalName}`,
            `C: ${formatDateTime(targetMessage.createdAt)}`,
            `Q: ${formatDateTime(new Date())}`,
          ].reverse();
          ctx.font = font.replace('16px', '12px');
          ctx.textAlign = 'left';
          infoMessage.forEach((info, index) => {
            ctx.fillText(
              info,
              0,
              canvasHeight - ((index + 2) * 12 + 5 * index),
              afterAvatar,
            );
          });

          const attachment = new AttachmentBuilder(
            canvas.toBuffer('image/png'),
            {
              name: 'quote_image.png',
            },
          );
          await interaction.editReply({
            files: [attachment],
          });
          break;
        }
        default: {
          await interaction.reply({
            content: 'Unknown action.',
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
