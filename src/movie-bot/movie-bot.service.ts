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
  }

  expireAt = new Date(Date.now() + 2 * 60 * 1000);

  async start(ctx) {
    try {
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
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Movie is not Available in My Database.</b>\n\n<b><u>Examples for Typing</u></b>\n 1.<Web Series Name> S01 or <Web Series Name> S02 \n2. <Movie Name> \n3. <Web Series Name>\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Movie Available in our bot Using <b> List of Movies</b> </i> \n\n <i>If the Movie is not in the List. Kindly Contact the Admin Using <b>Request Movie</b></i>`,
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

      // Files
      for (const file of movie.files) {
        const fileMsg = await ctx.telegram.forwardMessage(
          ctx.chat.id,
          file.chatId,
          file.messageId,
        );
        sentMessages.push({
          chatId: ctx.chat.id,
          messageId: fileMsg.message_id,
        });
      }

      await ctx.deleteMessage(anime.message_id);

      const successMsg = await ctx.reply(
        `✅ <b>Movie "${movie.name}" sent successfully!</b>\n\n🍿 Enjoy watching. \n\n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
        { parse_mode: 'HTML' },
      );
      sentMessages.push({
        chatId: ctx.chat.id,
        messageId: successMsg.message_id,
      });
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
          });
        } catch (err) {
          console.error(
            `❌ Could not send to ${user.telegramId}:`,
            err.message,
          );
        }
      }

      console.log(`✅ Broadcast sent to ${users.length} users`);
    } catch (err) {
      console.error('Broadcast error:', err.message);
    }
  }
}
