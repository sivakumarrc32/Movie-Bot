/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { Anime } from './anime.schema';
import { AnimeUser } from './anime.user.schema';
import { TempMessage } from 'src/movie-bot/temp.schema';
import { ratio } from 'fuzzball';

@Injectable()
export class AnimeService implements OnModuleInit {
  public bot: Telegraf;
  public ownerId: number;
  private PAGE_SIZE = 10;

  constructor(
    @InjectModel(Anime.name) private animeModel: Model<Anime>,
    @InjectModel(AnimeUser.name) private userModel: Model<AnimeUser>,
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('ANIME_BOT_TOKEN')!);
    this.ownerId = 992923409;
  }

  private checkOwner(ctx: any): boolean {
    if (ctx.from.id !== this.ownerId) {
      ctx.reply(
        '<b>🚫 You are not authorized to use this bot.</b> \n\n\n @lord_fourth_anime_bot Here You Can Get the Animes',
        {
          parse_mode: 'HTML',
        },
      );
      return false;
    }
    return true;
  }

  private channels = ['-1003261050452', '-1003624602414', '-1003233206043']; // 🔴 unga rendu channel usernames

  private async checkSubscription(ctx: any): Promise<boolean> {
    try {
      for (const channel of this.channels) {
        const chatMember = await ctx.telegram.getChatMember(
          channel,
          ctx.from.id,
        );

        if (chatMember.status === 'left') {
          await ctx.replyWithAnimation(
            'CgACAgUAAxkBAAIBqWje1uUB4Kfp1iH2SFv8PMY12VkXAAJ-GQACSsz4Vly_XR76PxZ-NgQ',
            {
              caption:
                '<b>🚫 To use this bot, you must join all our channels first.</b>',
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '📢 Join Channel 1',
                      url: 'https://t.me/LordFourthMovieTamil',
                    },
                    {
                      text: '📢 Join Channel 2',
                      url: 'https://t.me/+uhgXU7hwvnk2YTRl',
                    },
                  ],
                  [
                    {
                      text: 'Main Channel',
                      url: 'https://t.me/+OnhJMqwc380zM2I1',
                    },
                  ],
                  [{ text: 'Try Again', callback_data: 'check_join' }],
                ],
              },
            },
          );
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('checkSubscription error:', err.message);
      return false;
    }
  }

  onModuleInit() {
    // this.bot.start((ctx) => this.start(ctx));
    this.bot.start(async (ctx) => {
      try {
        await this.reactMessage(ctx);
      } catch (e) {
        console.log(e);
      }
      let payload =
        ctx.payload || ctx.message?.text?.split(' ').slice(1).join(' ');

      if (payload) {
        try {
          payload = Buffer.from(payload, 'base64').toString('utf-8');
        } catch (e) {
          payload = decodeURIComponent(payload);
          console.log('Payload:', e.message); // fallback if normal encoding
        }
      }
      console.log('Payload:', payload);
      await this.start(ctx, payload);
    });
    this.bot.command('help', (ctx) => this.help(ctx));
    this.bot.command('list', async (ctx) => {
      await this.sendAnimeList(ctx, 1, false); // false => not editing, fresh reply
    });

    this.bot.action(/^list_page_(\d+)$/, async (ctx) => {
      const page = parseInt(ctx.match[1]);
      await this.sendAnimeList(ctx, page, true); // true => editing
    });
    this.bot.command('broadcast', (ctx) => this.broadcast(ctx));
    this.bot.on('text', (ctx) => this.sendAnime(ctx));
    this.bot.action('list', (ctx) => this.sendAnimeList(ctx, 1, false));
    this.bot.action('help', (ctx) => this.help(ctx));
    this.bot.action('about', (ctx) => this.about(ctx));
    this.bot.action('backToStart', (ctx) => this.backToStart(ctx));
    this.bot.action('check_join', async (ctx) => {
      const isJoined = await this.checkSubscription(ctx);
      if (isJoined) {
        await ctx.answerCbQuery('✅ You have joined the channels!');
        await this.start(ctx);
      } else {
        await ctx.answerCbQuery('❌ Please join all channels first!');
      }
    });
    this.bot.action(/^(all|file|page)_/, (ctx) =>
      this.handleEpisodeSelection(ctx),
    );
    this.bot.action('noop', async (ctx) => {
      await ctx.answerCbQuery('❌ This Not a Button');
    });
    // this.bot.on('message', (ctx) => console.log(ctx.message));
  }

  async start(ctx, payload?: string) {
    try {
      if (payload) {
        const isJoined = await this.checkSubscription(ctx);
        if (!isJoined) return;
        await this.sendAnimeName(ctx, payload);
        return;
      }
      const isJoined = await this.checkSubscription(ctx);
      if (!isJoined) return;
      const userName = ctx.from.username;
      const message = await ctx.replyWithAnimation(
        'CgACAgUAAxkBAAIBqWje1uUB4Kfp1iH2SFv8PMY12VkXAAJ-GQACSsz4Vly_XR76PxZ-NgQ',
        {
          caption: `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a>\n\n<i>I'm your friendly Anime Bot 🤖</i>\n\n<b>Here, you can get anime files directly</b> — no link shorteners, no ads, just pure animes! 🍿\n\n👉 <b>Send the correct anime name</b>, and if it’s available in my database, you’ll get the <b>file instantly!</b>\n\n⚡<i>Enjoy your anime time! 🎥💫</i>`,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Anime Bot',
                  url: 'https://t.me/lord_fourth_anime_bot',
                },
                {
                  text: 'Movie Bot',
                  url: 'https://t.me/lord_fourth_movie3_bot',
                },
              ],
              [
                { text: '📃 List of Anime', callback_data: 'list' },
                { text: 'ℹ️ Help', callback_data: 'help' },
              ],
              [
                { text: '👨‍💻 About', callback_data: 'about' },
                {
                  text: '⚙️ Support',
                  url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
                },
              ],
              [{ text: 'Developer', url: 'https://t.me/Lord_Fourth04' }],
            ],
          },
        },
      );

      await this.tempMessageModel.create({
        messageId: message.message_id,
        chatId: ctx.chat.id,
        expireAt: new Date(Date.now() + 5 * 60 * 1000),
        userId: ctx.from.id,
      });

      const user = await this.userModel.findOne({
        telegramId: ctx.from.id,
      });
      if (!user) {
        await this.userModel.create({
          telegramId: ctx.from.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          languageCode: ctx.from.language_code,
          isBot: ctx.from.is_bot,
        });
      }
    } catch (err) {
      console.error('Start command error:', err.message);
    }
  }
  async sendAnimeList(ctx, page = 1, isEdit = false) {
    // const ani = await ctx.replyWithAnimation(
    //   'CAACAgUAAxkBAAIBpmje0EtKLDDHmnxLwL1Y8l7HtN0LAAJ9GQACSsz4Vv2odmJpcRPVNgQ',
    // );
    try {
      const limit = 15;
      const skip = (page - 1) * limit;

      const totalAnimes = await this.animeModel.countDocuments();
      const totalPages = Math.ceil(totalAnimes / limit);
      const anime = await this.animeModel
        .find({}, 'name')
        .skip(skip)
        .limit(limit);

      if (!anime.length) {
        return ctx.reply('<b>😢 No Animes available.</b>', {
          parse_mode: 'HTML',
        });
      }

      let msg = `<b><u>Available Animes :</u></b>\n\n🎬 <b>Page ${page}</b>\n\n`;
      anime.forEach(
        (m, i) => (msg += `<b>${skip + i + 1}. <code>${m.name}</code></b>\n`),
      );
      msg += `\n👉 Type the <b>Anime Name</b> to get anime.\n`;

      // await ctx.deleteMessage(ani.message_id);

      const buttons: { text: string; callback_data: string }[] = [];
      if (page > 1)
        buttons.push({
          text: '⬅️ Back',
          callback_data: `list_page_${page - 1}`,
        });
      buttons.push({
        text: `Pages ${page}/${totalPages}`,
        callback_data: 'noop',
      });
      if (skip + limit < totalAnimes)
        buttons.push({
          text: 'Next ➡️',
          callback_data: `list_page_${page + 1}`,
        });

      if (isEdit) {
        // pagination → edit existing bot message
        await ctx.editMessageText(msg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [buttons] },
        });
      } else {
        // /list → new message
        await ctx.reply(msg, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [buttons] },
        });
      }
    } catch (err) {
      console.error('List command error:', err.message);
      ctx.reply('⚠️ Error occurred while processing the command.');
    }
  }
  async sendAnime(ctx) {
    if (ctx.message.text.startsWith('/')) return;

    const ani = await ctx.replyWithAnimation(
      'CAACAgUAAxkBAAIBpmje0EtKLDDHmnxLwL1Y8l7HtN0LAAJ9GQACSsz4Vv2odmJpcRPVNgQ',
    );

    try {
      const name = ctx.message.text.trim();
      const animes = await this.animeModel.find({
        name: { $regex: name, $options: 'i' },
      });

      if (animes.length === 0) {
        await ctx.deleteMessage(ani.message_id);
        const msg = await ctx.reply(
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Anime is not Available in My Database.</b>\n\n<b>Anime Name Must be in Correct Format</b>\n\n <b><u>Examples for Typing</u></b>\n 1.(Anime Name) S01 or (Anime Name) S02 \n2. (Anime Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Anime Available in our bot Using <b> List of Animes</b> </i> \n\n <i>If the Anime is not in the List. Kindly Contact the Admin Using <b>Request Anime</b></i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Request Anime',
                    url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
                  },
                  {
                    text: 'List of Animes',
                    callback_data: 'list',
                  },
                ],
              ],
            },
          },
        );

        await this.tempMessageModel.create({
          chatId: ctx.chat.id,
          messageId: msg.message_id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
          userId: ctx.from.id,
        });

        return;
      }

      // const sentMessages: { chatId: number; messageId: number }[] = [];

      // // Poster
      // if (anime.poster?.chatId && anime.poster?.messageId) {
      //   const posterMsg = await ctx.telegram.forwardMessage(
      //     ctx.chat.id,
      //     anime.poster.chatId,
      //     anime.poster.messageId,
      //   );
      //   sentMessages.push({
      //     chatId: ctx.chat.id,
      //     messageId: posterMsg.message_id,
      //   });
      // }

      // // // Files
      // // for (const file of anime.files) {
      // //   const fileMsg = await ctx.telegram.forwardMessage(
      // //     ctx.chat.id,
      // //     file.chatId,
      // //     file.messageId,
      // //   );
      // //   sentMessages.push({
      // //     chatId: ctx.chat.id,
      // //     messageId: fileMsg.message_id,
      // //   });
      // // }
      // await this.sendEpisodePage(ctx, anime, 0);

      // await ctx.deleteMessage(ani.message_id);
      // const expireAt = new Date(Date.now() + 5 * 60 * 1000);

      // for (const msg of sentMessages) {
      //   await this.tempMessageModel.create({
      //     chatId: ctx.chat.id,
      //     messageId: msg.messageId,
      //     userId: ctx.from.id,
      //     expireAt,
      //   });
      //   console.log('message saved');
      // }
      if (animes.length === 1) {
        //Poster
        if (animes[0].poster?.chatId && animes[0].poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id,
            animes[0].poster.chatId,
            animes[0].poster.messageId,
          );
          await this.tempMessageModel.create({
            chatId: ctx.chat.id,
            messageId: posterMsg.message_id,
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        }
        return this.sendEpisodePage(ctx, animes[0], 0);
      } // 🔥 FUZZY MATCH (multiple movies)
      let bestMatch: Anime | null = null;
      let bestScore = 0;

      for (const anime of animes) {
        const score = ratio(name.toLowerCase(), anime.name.toLowerCase());

        // 🎯 bonus if year matches
        // if (year && movie.name.includes(String(year))) {
        //   score += 20;
        // }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = anime;
        }
      }

      console.log('BEST MATCH:', bestMatch?.name, bestScore);

      // ✅ confident match
      if (bestMatch && bestScore >= 90) {
        //Poster
        if (bestMatch.poster?.chatId && bestMatch.poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id,
            bestMatch.poster.chatId,
            bestMatch.poster.messageId,
          );
          await this.tempMessageModel.create({
            chatId: ctx.chat.id,
            messageId: posterMsg.message_id,
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        }
        return this.sendEpisodePage(ctx, bestMatch, 0);
      }

      // for (const msg of sentMessages) {
      //   await this.tempMessageModel.create({
      //     chatId: msg.chatId,
      //     messageId: msg.messageId,
      //     userId: ctx.from.id,
      //     expireAt,
      //   });
      // }

      // ❌ show multiple list
      await ctx.deleteMessage(ani.message_id);
      let list = '';
      animes.forEach((m) => {
        list += `• <code>${m.name}</code>\n`;
      });

      const msg = await ctx.reply(`<b>Multiple Animes found</b>\n\n${list}`, {
        parse_mode: 'HTML',
      });

      await this.tempMessageModel.create({
        chatId: msg.chat.id,
        messageId: msg.message_id,
        userId: ctx.from.id,
        expireAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    } catch (err) {
      console.error('Anime search error:', err.message);
    }
  }

  async sendAnimeName(ctx, name?: string) {
    // if (ctx.message.text.startsWith('/')) return;

    const ani = await ctx.replyWithAnimation(
      'CAACAgUAAxkBAAIBpmje0EtKLDDHmnxLwL1Y8l7HtN0LAAJ9GQACSsz4Vv2odmJpcRPVNgQ',
    );

    try {
      const searchText = name?.trim().toLowerCase();
      // const name = ctx.message.text.trim();
      const animes = await this.animeModel.find();

      if (animes.length === 0) {
        await ctx.deleteMessage(ani.message_id);
        const msg = await ctx.reply(
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Anime is not Available in My Database.</b>\n\n<b>Anime Name Must be in Correct Format</b>\n\n <b><u>Examples for Typing</u></b>\n 1.(Anime Name) S01 or (Anime Name) S02 \n2. (Anime Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Anime Available in our bot Using <b> List of Animes</b> </i> \n\n <i>If the Anime is not in the List. Kindly Contact the Admin Using <b>Request Anime</b></i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Request Anime',
                    url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
                  },
                  {
                    text: 'List of Animes',
                    callback_data: 'list',
                  },
                ],
              ],
            },
          },
        );

        await this.tempMessageModel.create({
          chatId: ctx.chat.id,
          messageId: msg.message_id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
          userId: ctx.from.id,
        });

        return;
      }

      // const sentMessages: { chatId: number; messageId: number }[] = [];

      // // Poster
      // if (anime.poster?.chatId && anime.poster?.messageId) {
      //   const posterMsg = await ctx.telegram.forwardMessage(
      //     ctx.chat.id,
      //     anime.poster.chatId,
      //     anime.poster.messageId,
      //   );
      //   sentMessages.push({
      //     chatId: ctx.chat.id,
      //     messageId: posterMsg.message_id,
      //   });
      // }

      // // // Files
      // // for (const file of anime.files) {
      // //   const fileMsg = await ctx.telegram.forwardMessage(
      // //     ctx.chat.id,
      // //     file.chatId,
      // //     file.messageId,
      // //   );
      // //   sentMessages.push({
      // //     chatId: ctx.chat.id,
      // //     messageId: fileMsg.message_id,
      // //   });
      // // }
      // await this.sendEpisodePage(ctx, anime, 0);

      // await ctx.deleteMessage(ani.message_id);
      // const expireAt = new Date(Date.now() + 5 * 60 * 1000);

      // for (const msg of sentMessages) {
      //   await this.tempMessageModel.create({
      //     chatId: ctx.chat.id,
      //     messageId: msg.messageId,
      //     userId: ctx.from.id,
      //     expireAt,
      //   });
      //   console.log('message saved');
      // }
      // 🔥 FUZZY MATCH
      let bestMatch: Anime | null = null;
      let bestScore = 0;

      for (const anime of animes) {
        if(!searchText) return;
        const score = ratio(searchText, anime.name.toLowerCase());

        if (score > bestScore) {
          bestScore = score;
          bestMatch = anime;
        }
      }

      console.log('BEST MATCH:', bestMatch?.name, bestScore);

      // ✅ confident match
      if (bestMatch && bestScore >= 90) {
        if (bestMatch.poster?.chatId && bestMatch.poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id,
            bestMatch.poster.chatId,
            bestMatch.poster.messageId,
          );
          await this.tempMessageModel.create({
            chatId: ctx.chat.id,
            messageId: posterMsg.message_id,
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        }
        return this.sendEpisodePage(ctx, bestMatch, 0);
      }

      // const expireAt = new Date(Date.now() + 5 * 60 * 1000);

      // for (const msg of sentMessages) {
      //   await this.tempMessageModel.create({
      //     chatId: msg.chatId,
      //     messageId: msg.messageId,
      //     userId: ctx.from.id,
      //     expireAt,
      //   });
      //   console.log('message saved');
      // }
      await ctx.deleteMessage(ani.message_id);
      // ❌ no confident match
      const msg = await ctx.reply(
        `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Anime is not Available in My Database.</b>\n\n<b>Anime Name Must be in Correct Format</b>\n\n<b><u>Examples for Typing</u></b>\n 1.(Web Series Name) S01 or (Web Series Name) S02 \n2. (Anime Name) \n3. (Web Series Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Anime Available in our bot Using <b> List of Animes</b> </i> \n\n <i>If the Anime is not in the List. Kindly Contact the Admin Using <b>Request Anime</b></i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Request Anime',
                  url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
                },
                {
                  text: 'List of Animes',
                  callback_data: 'list',
                },
              ],
            ],
          },
        },
      );
      await this.tempMessageModel.create({
        chatId: msg.chat.id,
        messageId: msg.message_id,
        expireAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    } catch (err) {
      console.error('Anime search error:', err.message);
    }
  }
  async broadcast(ctx) {
    try {
      console.log('Broadcast command called');
      if (!this.checkOwner(ctx)) return;
      console.log('Broadcast command authorized');
      const text = ctx.message.text.split(' ').slice(1).join(' ');
      if (!text) return ctx.reply('⚠️ Please provide a message.');
      await this.sendBroadcast(text);
      await ctx.reply('✅ Broadcast sent!');
    } catch (err) {
      console.error('Broadcast command error:', err.message);
    }
  }
  async help(ctx) {
    try {
      const msg = await ctx.reply(
        "<u> <b>Available Commands</b> </u>\n\n👉🏻 1. /list -Use this command to see all available animes.\n\n👉🏻 2. /help - To view the commands available in this bot \n\n✨ Just type the anime name to get anime instantly!\n\n <i><b>Note :</b> if you know the anime name then type the anime name corretly and get anime files</i> \n\n<i>if you don't know the exact moive name follow the steps below</i>\n\n<u>Follow the Steps to Get the Anime File</u>\n\n<b>Step - 1 :</b> Use /list Command to get the anime list.\n\n<b>Step - 2 :</b> If the anime Available in the list <b>Press the anime Name It Will Be Copied</b> \n\n<b>Step - 3 :</b> Paste and Send the anime You Will Get the Files \n\n<b>Step - 4 :</b> After Getting the File Forward to Your Friends or In Your Saved Message.\n\n <b> Because Files Will Be Deleted After 5 Mins. For Copyrights Issues</b> \n\n\n <i><b>Thanks For Using Our Bot....❤️</b></i>",
        { parse_mode: 'HTML' },
      );

      await this.tempMessageModel.create({
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        expireAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    } catch (err) {
      console.error('Help command error:', err.message);
    }
  }

  async about(ctx) {
    await ctx.answerCbQuery();

    try {
      const msg = await ctx.editMessageCaption(
        `<b>🤖 My Name </b>: <a href="https://t.me/lord_fourth_anime_bot">Anime Bot</a> ⚡️\n<b>📝 Language </b>: <a href="https://nestjs.com/">Nest JS</a>\n<b>🚀 Server </b>: <a href="https://vercel.com/">Vercel</a> \n<b>📢 Channel </b>: <a href="https://t.me/LordFourthMovieTamil">Lord Fourth Movie Tamil</a>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Back', callback_data: 'backToStart' }],
            ],
          },
        },
      );

      await this.tempMessageModel.create({
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        expireAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    } catch (err) {
      console.error('About command error:', err.message);
    }
  }

  async backToStart(ctx) {
    try {
      await ctx.answerCbQuery();

      await ctx.editMessageCaption(
        `👋 <b>Welcome to Anime Bot!</b>\n\n<i>Available Commands</i>\n\n1. /list - Use this command to see all available Animes.\n2. /help - To view the commands available in this bot.\n\n✨ Just type the Anime name to get Anime instantly!`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📃 List of Animes', callback_data: 'list' },
                { text: 'ℹ️ Help', callback_data: 'help' },
              ],
              [
                { text: '👨‍💻 About Bot', callback_data: 'about' },
                {
                  text: '⚙️ Support',
                  url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
                },
              ],
              [{ text: 'Developer', url: 'https://t.me/Lord_Fourth04' }],
            ],
          },
        },
      );
    } catch (err) {
      console.error('Back to start error:', err.message);
    }
  }
  async sendBroadcast(message: string) {
    try {
      const users = await this.userModel.find({}, 'telegramId');

      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          } as any);
        } catch (err) {
          console.error(
            `❌ Could not send to ${user.telegramId}:`,
            err.message,
          );
          const errorMsg = err.message || '';
          if (
            errorMsg.includes('bot was blocked by the user') ||
            errorMsg.includes('user is deactivated') ||
            errorMsg.includes('chat not found')
          ) {
            console.log(`🗑️ Removing inactive user: ${user.telegramId}`);
            await this.userModel.deleteOne({ telegramId: user.telegramId });
          } else {
            console.error(`⚠️ Error sending to ${user.telegramId}:`, errorMsg);
          }
        }
      }

      console.log(`✅ Broadcast sent to ${users.length} users`);
    } catch (err) {
      console.error('Broadcast error:', err.message);
    }
  }

  async handleEpisodeSelection(ctx) {
    try {
      await ctx.answerCbQuery(); // hide "loading" in Telegram

      const data = ctx.callbackQuery.data as string;

      if (data.startsWith('page_')) {
        console.log('page_', data);
        const parts = data.split('_');
        const animeId = parts[1];
        const page = parseInt(parts[2], 10);

        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');

        // show the requested page
        return this.sendEpisodePage(ctx, anime, page);
      }

      if (data.startsWith('all_')) {
        const animeId = data.split('_')[1];
        const anime = await this.animeModel.findById(animeId);

        if (!anime) return ctx.reply('❌ Anime not found.');

        for (const file of anime.files) {
          const message = await ctx.telegram.forwardMessage(
            ctx.chat.id,
            file.chatId,
            file.messageId,
          );

          await this.tempMessageModel.create({
            userId: ctx.from.id,
            messageId: message.message_id,
            chatId: ctx.chat.id,
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        }
        const successMsg = await ctx.reply(
          `✅ <b>Anime "${anime.name}" sent successfully!</b>\n\n 🙇🏻<b>"Episode orders are not proper, please check Sorry for the inconvenience "</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
          { parse_mode: 'HTML' },
        );

        await this.tempMessageModel.create({
          userId: ctx.from.id,
          messageId: successMsg.message_id,
          chatId: ctx.chat.id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        return;
      }

      if (data.startsWith('file_')) {
        const parts = data.split('_');
        const animeId = parts[1];
        const idx = parseInt(parts[2], 10);

        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');

        const file = anime.files[idx];
        if (!file) return ctx.reply('❌ Episode not found.');

        const msg = await ctx.telegram.forwardMessage(
          ctx.chat.id,
          file.chatId,
          file.messageId,
        );

        await this.tempMessageModel.create({
          userId: ctx.from.id,
          messageId: msg.message_id,
          chatId: ctx.chat.id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        const successMsg = await ctx.reply(
          `✅ <b>Anime "${anime.name}" sent successfully!</b>\n\n 🙇🏻<b>"Episode orders are not proper, please check Sorry for the inconvenience "</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
          { parse_mode: 'HTML' },
        );

        await this.tempMessageModel.create({
          userId: ctx.from.id,
          messageId: successMsg.message_id,
          chatId: ctx.chat.id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        return;
      }
    } catch (err) {
      console.error('Error sending episode:', err.message);
    }
  }

  private async sendEpisodePage(ctx, anime, page: number) {
    const start = page * this.PAGE_SIZE;
    const end = start + this.PAGE_SIZE;

    const files = anime.files.slice(start, end);
    const totalPages = Math.ceil(anime.files.length / this.PAGE_SIZE);

    const buttons: any[] = [];

    // Send All button only in first page
    if (page === 0) {
      buttons.push([
        { text: '📥 Send All', callback_data: `all_${anime._id}` },
      ]);
    }

    files.forEach((file, idx) => {
      const fileName = file.fileName
        .replace(/^@[^-_]+[-_]*\s*-*\s*/, '') // remove @BotName prefixes with - or _
        .replace(/\.mkv$/i, '');
      const fileSize = file.size || '';
      buttons.push([
        {
          text: `[${fileSize}]-${fileName}`,
          callback_data: `file_${anime._id}_${start + idx}`,
        },
      ]);
    });

    // Pagination buttons
    const navButtons: any[] = [];
    if (page > 0) {
      navButtons.push({
        text: '⬅️ Prev',
        callback_data: `page_${anime._id}_${page - 1}`,
      });
    }
    navButtons.push({
      text: `Page ${page + 1}/${totalPages}`,
      callback_data: 'noop',
    });
    if (end < anime.files.length) {
      console.log('end < anime.files.length', end, anime.files.length);
      navButtons.push({
        text: 'Next ➡️',
        callback_data: `page_${anime._id}_${page + 1}`,
      });
    }
    if (navButtons.length) buttons.push(navButtons);

    if (ctx.updateType === 'callback_query') {
      // edit the inline keyboard when callback
      await ctx.editMessageText(
        `<b>${anime.name} Episodes (Page ${page + 1})</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        },
      );
    } else {
      // normal reply when user types anime name
      const msg = await ctx.reply(
        `<b>${anime.name} Episodes (Page ${page + 1})</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        },
      );

      await this.tempMessageModel.create({
        userId: ctx.from.id,
        messageId: msg.message_id,
        chatId: ctx.chat.id,
        expireAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    }
  }

  async reactMessage(ctx) {
    try {
      const chatId = ctx.chat.id;
      const messageId = ctx.message.message_id;
      const emojis = [
        '👍',
        '👎',
        '❤️',
        '🔥',
        '🎉',
        '🤩',
        '😱',
        '😁',
        '😢',
        '💩',
        '🤮',
        '🥰',
        '🤯',
        '🤔',
        '🤬',
        '👏',
      ];

      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

      await ctx.telegram.setMessageReaction(
        chatId,
        messageId,
        [{ type: 'emoji', emoji: randomEmoji }],
        { is_big: true },
      );

      console.log(`Reacted with ${randomEmoji} to message ${messageId}`);
    } catch (err) {
      console.error('Error reacting:', err);
    }
  }
}
