/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { Movie } from './movie.schema';
import { ConfigService } from '@nestjs/config';
import { User } from './user.schema';
import { TempMessage } from './temp.schema';

@Injectable()
export class MovieBotService implements OnModuleInit {
  public bot: Telegraf;
  public ownerId: number;
  private PAGE_SIZE = 10;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
    this.ownerId = 992923409;
  }

  private checkOwner(ctx: any): boolean {
    if (ctx.from.id !== this.ownerId) {
      ctx.reply(
        '<b>🚫 You are not authorized to use this bot.</b> \n\n\n @lord_fourth_movie_bot Here You Can Get the Movies',
        {
          parse_mode: 'HTML',
        },
      );
      return false;
    }
    return true;
  }

  private channels = ['@LordFourthMovieTamil', '@LordFourthAnimeTamil']; // 🔴 unga rendu channel usernames

  private async checkSubscription(ctx: any): Promise<boolean> {
    try {
      for (const channel of this.channels) {
        const chatMember = await ctx.telegram.getChatMember(
          channel,
          ctx.from.id,
        );

        if (chatMember.status === 'left') {
          await ctx.replyWithAnimation(
            'CgACAgUAAxkBAAICL2jP7zdwPsDQ8Kocl6nQ1ZXrjI1gAAJYGwACybiAVlKUd15e35cCNgQ',
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
                      url: 'https://t.me/LordFourthAnimeTamil',
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
    this.bot.start((ctx) => this.start(ctx));
    this.bot.command('help', (ctx) => this.help(ctx));
    this.bot.command('list', async (ctx) => {
      await this.sendMovieList(ctx, 1, false); // false => not editing, fresh reply
    });

    this.bot.action(/^list_page_(\d+)$/, async (ctx) => {
      const page = parseInt(ctx.match[1]);
      await this.sendMovieList(ctx, page, true); // true => editing
    });

    this.bot.command('broadcast', (ctx) => this.broadcast(ctx));
    this.bot.on('text', (ctx) => this.sendMovie(ctx));
    this.bot.action('list', (ctx) => this.sendMovieList(ctx, 1, false));
    this.bot.action('help', (ctx) => this.help(ctx));
    this.bot.action('about', (ctx) => this.about(ctx));
    this.bot.action('backToStart', (ctx) => this.backToStart(ctx));
    this.bot.action('check_join', async (ctx) => {
      const isJoined = await this.checkSubscription(ctx);
      if (isJoined) {
        await ctx.answerCbQuery('✅ You have joined the channels!');
        await this.start(ctx);
      } else {
        await ctx.answerCbQuery('❌ Please join all channels first!', {
          show_alert: true,
        });
      }
    });
    this.bot.action(/^(all|file|page)_/, (ctx) =>
      this.handleEpisodeSelection(ctx),
    );
    this.bot.action('noop', async (ctx) => {
      await ctx.answerCbQuery('❌ This is Not a Button');
    });
  }

  expireAt = new Date(Date.now() + 2 * 60 * 1000);

  async start(ctx) {
    try {
      const isJoined = await this.checkSubscription(ctx);
      if (!isJoined) return;
      const userName = ctx.from.username;
      const msg = await ctx.replyWithAnimation(
        'CgACAgUAAxkBAAICL2jP7zdwPsDQ8Kocl6nQ1ZXrjI1gAAJYGwACybiAVlKUd15e35cCNgQ', // Local file
        {
          caption: `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a> \n\n<b>Welcome to Movie Bot!</b>\n\n\n <u><b><i>Available Commands</i></b></u> \n\n 1. /list -Use this command to see all available movies.\n\n 2. /help - To view the commands available in this bot \n\n✨ Just type the movie name to get movie instantly!`,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Movie Bot',
                  url: 'https://t.me/lord_fourth_movie_bot',
                },
                {
                  text: 'Anime Bot',
                  url: 'https://t.me/lord_fourth_anime_bot',
                },
              ],
              [
                { text: '📃 List of Movies', callback_data: 'list' },
                { text: 'ℹ️ Help', callback_data: 'help' },
              ],
              [
                { text: '👨‍💻 About Bot', callback_data: 'about' },
                {
                  text: '⚙️ Support',
                  url: 'https://t.me/Feedback_LordFourth_Bot?start=_tgr_W-HlEd45Yzll',
                },
              ],
              [{ text: 'Developer', url: 'https://t.me/Lord_Fourth04' }],
            ],
          },
        },
      );

      await this.tempMessageModel.create({
        telegramId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        expireAt: this.expireAt,
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
  async sendMovieList(ctx, page = 1, isEdit = false) {
    try {
      const limit = 15;
      const skip = (page - 1) * limit;

      const totalMovies = await this.movieModel.countDocuments();
      const totalPages = Math.ceil(totalMovies / limit);
      const movies = await this.movieModel
        .find({}, 'name')
        .skip(skip)
        .limit(limit);

      if (!movies.length) {
        return ctx.reply('<b>😢 No movies available.</b>', {
          parse_mode: 'HTML',
        });
      }

      let msg = `<b><u>Available Movies :</u></b>\n\n🎬 <b>Page ${page}</b>\n\n`;
      movies.forEach(
        (m, i) => (msg += `<b>${skip + i + 1}. <code>${m.name}</code></b>\n`),
      );
      msg += `\n👉 Type the <b>Movie Name</b> to get Movie.\n`;

      const buttons: { text: string; callback_data: string }[] = [];
      if (page > 1)
        buttons.push({
          text: '⬅️ Back',
          callback_data: `list_page_${page - 1}`,
        });
      buttons.push({
        text: `Pages: ${page}/${totalPages}`,
        callback_data: 'noop',
      });
      if (skip + limit < totalMovies)
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
      console.error('sendMovieList command error:', err.message);
    }
  }
  async sendMovie(ctx) {
    if (ctx.message.text.startsWith('/')) return;

    const anime = await ctx.replyWithAnimation(
      'CAACAgUAAxkBAAP2aMg-M9L2BweitSj2A-C__K4Fm-oAAmYZAALItUBW-knJhi1GBE42BA',
    );

    try {
      const name = ctx.message.text.trim();
      const movie = await this.movieModel.findOne({
        name: { $regex: name, $options: 'i' },
      });

      if (!movie) {
        await ctx.deleteMessage(anime.message_id);
        const msg = await ctx.reply(
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Movie is not Available in My Database.</b>\n\n<b>Movie Name Must be in Correct Format</b>\n\n<b><u>Examples for Typing</u></b>\n 1.(Web Series Name) S01 or (Web Series Name) S02 \n2. (Movie Name) \n3. (Web Series Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Movie Available in our bot Using <b> List of Movies</b> </i> \n\n <i>If the Movie is not in the List. Kindly Contact the Admin Using <b>Request Movie</b></i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Request Movie',
                    url: 'https://t.me/Feedback_LordFourth_Bot?start=_tgr_W-HlEd45Yzll',
                  },
                  {
                    text: 'List of Movies',
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
          expireAt: this.expireAt,
        });
        return;
      }

      const sentMessages: { chatId: number; messageId: number }[] = [];

      // Poster
      if (movie.poster?.chatId && movie.poster?.messageId) {
        const posterMsg = await ctx.telegram.forwardMessage(
          ctx.chat.id,
          movie.poster.chatId,
          movie.poster.messageId,
        );
        sentMessages.push({
          chatId: ctx.chat.id,
          messageId: posterMsg.message_id,
        });
      }

      // // Files
      // for (const file of movie.files) {
      //   const fileMsg = await ctx.telegram.forwardMessage(
      //     ctx.chat.id,
      //     file.chatId,
      //     file.messageId,
      //   );
      //   sentMessages.push({
      //     chatId: ctx.chat.id,
      //     messageId: fileMsg.message_id,
      //   });
      // }

      await this.sendEpisodePage(ctx, movie, 0);

      await ctx.deleteMessage(anime.message_id);

      const expireAt = new Date(Date.now() + 5 * 60 * 1000);

      for (const msg of sentMessages) {
        await this.tempMessageModel.create({
          chatId: msg.chatId,
          messageId: msg.messageId,
          userId: ctx.from.id,
          expireAt,
        });
        console.log('message saved');
      }
    } catch (err) {
      console.error('Movie search error:', err.message);
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
        "<u> <b>Available Commands</b> </u>\n\n👉🏻 1. /list -Use this command to see all available movies.\n\n👉🏻 2. /help - To view the commands available in this bot \n\n✨ Just type the movie name to get movie instantly!\n\n <i><b>Note :</b> if you know the movie name then type the movie name corretly and get movie files</i> \n\n<i>if you don't know the exact moive name follow the steps below</i>\n\n<u>Follow the Steps to Get the Movie File</u>\n\n<b>Step - 1 :</b> Use /list Command to get the movie list.\n\n<b>Step - 2 :</b> If the Movie Available in the list <b>Press the Movie Name It Will Be Copied</b> \n\n<b>Step - 3 :</b> Paste and Send the Movie You Will Get the Files \n\n<b>Step - 4 :</b> After Getting the File Forward to Your Friends or In Your Saved Message.\n\n <b> Because Files Will Be Deleted After 5 Mins. For Copyrights Issues</b> \n\n\n <i><b>Thanks For Using Our Bot....❤️</b></i>",
        { parse_mode: 'HTML' },
      );

      await this.tempMessageModel.create({
        telegramId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        expireAt: this.expireAt,
      });
    } catch (err) {
      console.error('Help command error:', err.message);
    }
  }

  async about(ctx) {
    await ctx.answerCbQuery();

    try {
      const msg = await ctx.editMessageCaption(
        `<b>🤖 My Name </b>: <a href="https://t.me/lord_fourth_movie_bot">Movie Bot</a> ⚡️\n<b>📝 Language </b>: <a href="https://nestjs.com/">Nest JS</a>\n<b>🚀 Server </b>: <a href="https://vercel.com/">Vercel</a> \n<b>📢 Channel </b>: <a href="https://t.me/LordFourthMovieTamil">Lord Fourth Movie Tamil</a>`,
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
        telegramId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        expireAt: this.expireAt,
      });
    } catch (err) {
      console.error('About command error:', err.message);
    }
  }

  async backToStart(ctx) {
    try {
      await ctx.answerCbQuery();

      const msg = await ctx.editMessageCaption(
        `👋 <b>Welcome to Movie Bot!</b>\n\n<i>Available Commands</i>\n\n1. /list - Use this command to see all available movies.\n2. /help - To view the commands available in this bot.\n\n✨ Just type the movie name to get movie instantly!`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📃 List of Movies', callback_data: 'list' },
                { text: 'ℹ️ Help', callback_data: 'help' },
              ],
              [
                { text: '👨‍💻 About Bot', callback_data: 'about' },
                {
                  text: '⚙️ Support',
                  url: 'https://t.me/Feedback_LordFourth_Bot?start=_tgr_W-HlEd45Yzll',
                },
              ],
              [{ text: 'Developer', url: 'https://t.me/Lord_Fourth04' }],
            ],
          },
        },
      );

      await this.tempMessageModel.create({
        telegramId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        expireAt: this.expireAt,
      });
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
        const movieId = parts[1];
        const page = parseInt(parts[2], 10);

        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');

        // show the requested page
        return this.sendEpisodePage(ctx, movie, page);
      }

      if (data.startsWith('all_')) {
        const movieId = data.split('_')[1];
        const movie = await this.movieModel.findById(movieId);

        if (!movie) return ctx.reply('❌ Movie not found.');

        for (const file of movie.files) {
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
          `✅ <b>Movie "${movie.name}" sent successfully!</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
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
        const movieId = parts[1];
        const idx = parseInt(parts[2], 10);

        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');

        const file = movie.files[idx];
        if (!file) return ctx.reply('❌ File not found.');

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

        const successMsg = await ctx.reply(
          `✅ <b>Movie "${movie.name}" sent successfully!</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
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

  private async sendEpisodePage(ctx, movie, page: number) {
    const start = page * this.PAGE_SIZE;
    const end = start + this.PAGE_SIZE;

    const files = movie.files.slice(start, end);
    const totalPages = Math.ceil(movie.files.length / this.PAGE_SIZE);

    const buttons: any[] = [];

    // Send All button only in first page
    if (page === 0) {
      buttons.push([
        { text: '📥 Send All', callback_data: `all_${movie._id}` },
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
          callback_data: `file_${movie._id}_${start + idx}`,
        },
      ]);
    });

    // Pagination buttons
    const navButtons: any[] = [];
    if (page > 0) {
      navButtons.push({
        text: '⬅️ Prev',
        callback_data: `page_${movie._id}_${page - 1}`,
      });
    }
    navButtons.push({
      text: `Pages ${page + 1}/${totalPages}`,
      callback_data: 'noop',
    });
    if (end < movie.files.length) {
      console.log('end < anime.files.length', end, movie.files.length);
      navButtons.push({
        text: 'Next ➡️',
        callback_data: `page_${movie._id}_${page + 1}`,
      });
    }
    if (navButtons.length) buttons.push(navButtons);

    if (ctx.updateType === 'callback_query') {
      // edit the inline keyboard when callback
      await ctx.editMessageText(
        `<b>${movie.name} Episodes (Page ${page + 1})</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        },
      );
    } else {
      // normal reply when user types anime name
      const msg = await ctx.reply(
        `<b>${movie.name} Episodes (Page ${page + 1})</b>`,
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
}
