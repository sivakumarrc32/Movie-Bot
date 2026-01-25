/* eslint-disable prettier/prettier */
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
import { ratio } from 'fuzzball';
import { Anime } from 'src/anime/anime.schema';
import { RequestMovies } from './requestMovies.schema';
import { Setting } from './settings.schema';
// import { pay } from 'node_modules/telegraf/typings/button';

type ChannelInfo = {
  id: string;
  text: string;
  url: string;
};

@Injectable()
export class MovieBotService implements OnModuleInit {
  public bot: Telegraf;
  public ownerId: number;
  private PAGE_SIZE = 10;
  private boturl = '';
  private animeboturl = '';
  private botStarted = false;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    @InjectModel(Anime.name) private animeModel: Model<Anime>,
    @InjectModel(RequestMovies.name) private requestModel: Model<RequestMovies>,
    @InjectModel(Setting.name) private settingModel: Model<Setting>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
    this.ownerId = 992923409;
  }
  async loadBotUrl() {
    const data = await this.settingModel.findOne();
    if (data) {
      this.boturl = data.boturl || '';
      this.animeboturl = data.animeboturl || '';
    } else {
      await this.settingModel.create({
        boturl: this.boturl,
        animeboturl: this.animeboturl,
      });
    }
  }

  private checkOwner(ctx: any): boolean {
    if (ctx.from.id !== this.ownerId) {
      ctx.reply(
        '<b>🚫 You are not authorized to use this bot.</b> \n\n\n @lord_fourth_movie5_bot Here You Can Get the Movies',
        {
          parse_mode: 'HTML',
        },
      );
      return false;
    }
    return true;
  }

  private channels: ChannelInfo[] = [
    {
      id: '-1003261050452',
      text: '📢 Join Channel 1',
      url: 'https://t.me/LordFourthMovieTamil',
    },
    {
      id: '-1003326848627',
      text: '📢 Join Channel 2',
      url: 'https://t.me/+Ekzqobyp6GY4OGE9',
    },
    {
      id: '-1003579412645',
      text: '📢 Join Channel 3',
      url: 'https://t.me/+YfFvZ_QPOqBiYzE1',
    },
    {
      id: '-1003624602414',
      text: 'Main Channel',
      url: 'https://t.me/+uhgXU7hwvnk2YTRl',
    },
  ]; // 🔴 unga rendu channel usernames

  private async checkSubscription(ctx: any): Promise<boolean> {
    try {
      const notJoined: ChannelInfo[] = [];

      // 🔍 Check join status
      for (const channel of this.channels) {
        const member = await ctx.telegram.getChatMember(
          channel.id,
          ctx.from.id,
        );

        if (member.status === 'left' || member.status === 'kicked') {
          notJoined.push(channel);
        }
      }

      // ✅ Already joined all
      if (notJoined.length === 0) {
        return true;
      }

      // 🎯 Build buttons (2 per row)
      const keyboard: any[] = [];

      for (let i = 0; i < notJoined.length; i += 2) {
        keyboard.push(
          notJoined.slice(i, i + 2).map((ch) => ({
            text: ch.text,
            url: ch.url,
          })),
        );
      }

      // 🔄 Try Again button
      keyboard.push([{ text: '🔄 Try Again', callback_data: 'check_join' }]);

      await ctx.replyWithAnimation(
        'CgACAgUAAxkBAAMaaTcPME2k0MGOdKyHpwEProcoi_8AAmYZAALK8rlVtT1IxIOSGeo2BA',
        {
          caption:
            `Hi ${ctx.from.first_name},\n\n` +
            `<b>Innum sila channel la join pannanum</b>\n\n` +
            `Movies & updates miss aagama irukka\n` +
            `👇 keela irukkura channel la join pannunga`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: keyboard,
          },
        },
      );

      return false;
    } catch (err) {
      console.error('checkSubscription error:', err.message);
      return false;
    }
  }

  async onModuleInit() {
    // this.bot.on('message', async (ctx) => {
    //   const data = ctx.message;
    //   await ctx.reply(`Received message: ${JSON.stringify(data)}`);
    // });
    // this.bot.start((ctx) => this.start(ctx));
    await this.loadBotUrl();
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
      await this.sendMovieList(ctx, 1, false); // false => not editing, fresh reply
    });
    this.bot.command('rm' , async (ctx) => this.requestedMovies(ctx));
    this.bot.command('drm', async (ctx) => this.deleteRequestedMovies(ctx));
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
    this.bot.action(/^(anime_all|anime_file|anime_page)_/, (ctx) =>
      this.handleAnimeEpisodeSelection(ctx),
    );

    this.bot.action('noop', async (ctx) => {
      await ctx.answerCbQuery('❌ This is Not a Button');
    });

    // this.bot.launch();
    // if (!this.botStarted) {
    //   this.bot.launch();
    //   this.botStarted = true;

    //   process.once('SIGINT', () => this.bot.stop('SIGINT'));
    //   process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    // }
  }

  expireAt = new Date(Date.now() + 2 * 60 * 1000);

  async start(ctx, payload?: string) {
    try {
      if (payload) {
        const isJoined = await this.checkSubscription(ctx);
        if (!isJoined) return;
        await this.sendMovieName(ctx, payload);
        return;
      }
      const isJoined = await this.checkSubscription(ctx);
      if (!isJoined) return;
      const userName = ctx.from.username;
      const msg = await ctx.replyWithAnimation(
        'CgACAgUAAxkBAAMaaTcPME2k0MGOdKyHpwEProcoi_8AAmYZAALK8rlVtT1IxIOSGeo2BA', // Local file
        {
          caption: `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a> \n\n<i>I'm your friendly Movie Bot 🤖</i>\n\n<b>Here, you can get movie files directly</b> — no link shorteners, no ads, just pure movies! 🍿\n\n👉 <b>Send the correct movie name</b>, and if it’s available in my database, you’ll get the <b>file instantly!</b>\n\n⚡<i>Enjoy your movie time! 🎥💫</i>`,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Movie Bot',
                  url: 'https://t.me/lord_fourth_movie5_bot',
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
                  url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
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

    // const anime = await ctx.replyWithAnimation(
    //   'CAACAgUAAxkBAAMFaSc8IasIRuuXn1VeS6izQIULISAAAkYcAAKN_zlVtkSzXMfczYQ2BA',
    // );
    console.log('Checking 1');
    console.log(`Movie Request by ${ctx.from.first_name} ${ctx.from.last_name} ${ctx.from.username} ${ctx.from.id}`);

    try {
      const rawText = ctx.message.text.trim();
      // const year = rawText.match(/\d{4}/);

      // // 🟢 extract year
      const yearMatch = rawText.match(/\b\d{4}\b/);
      const year = yearMatch ? Number(yearMatch[0]) : null;

      const searchName = rawText;
      const splittedMovieName = searchName.split(' ');
      if (
        splittedMovieName.includes('Season') ||
        splittedMovieName.includes('season')
      ) {
        const WrongMovieNameMsg = await ctx.reply(
          `<blockquote><b>❌ Please Don't Use Season or season</b></blockquote>\n\n <b>Example:</b> \nGame of Thrones S01✅,\nGame of Thrones S02✅`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Rules',
                    callback_data: 'help',
                  },
                ],
              ],
            },
            reply_to_message_id: ctx.message.message_id,
          },
        );

        await this.tempMessageModel.create({
          chatId: WrongMovieNameMsg.chat.id,
          messageId: WrongMovieNameMsg.message_id,
          userId: ctx.from.id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        return;
      }

      const query: { name: { $regex: any; $options: string }; year?: number } =
        {
          name: { $regex: searchName, $options: 'i' },
        };

      if (year) {
        query.year = year;
      }

      const allMovies = await this.movieModel.find(query);
      const allAnimes = await this.animeModel.find(query);
      console.log(`🔴 allMovies - ${allMovies.length}`);
      console.log(`🔴 allAnimes - ${allAnimes.length}`);

      const movieMatches = await this.findTopMatches(searchName, allMovies);
      const animeMatches = await this.findTopMatches(searchName, allAnimes);

      // // ❌ no movie
      if (allMovies.length === 0 && allAnimes.length === 0) {
        const msg = await ctx.reply(
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Movie is not Available in My Database.</b>\n\n<b>Movie Name Must be in Correct Format</b>\n\n<b><u>Examples for Typing</u></b>\n 1.(Web Series Name) S01 or (Web Series Name) S02 \n2. (Movie Name) \n3. (Web Series Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Movie Available in our bot Using <b> List of Movies</b> </i> \n\n <i>If the Movie is not in the List. Kindly Contact the Admin Using <b>Request Movie</b></i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Check Spelling in Google',
                    url: `https://www.google.com/search?q=${searchName}`,
                  },
                ],
                [
                  {
                    text: 'Request Movie',
                    url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
                  },
                ],
              ],
            },
          },
        );
        await this.requestModel.create({
          name: searchName,
          userId: ctx.from.id.toString(),
          userName: ctx.from.first_name || ctx.from.username,
        });
        await this.tempMessageModel.create({
          chatId: ctx.chat.id,
          messageId: msg.message_id,
          expireAt: this.expireAt,
        });
        return;
      }

      let finalMovieMatches = movieMatches;
      let finalAnimeMatches = animeMatches;

      // 🔁 fallback: fuzzy empty but DB has data
      if (finalMovieMatches.length === 0 && allMovies.length > 0) {
        finalMovieMatches = allMovies.map((doc) => ({ doc, score: 0 }));
      }

      if (finalAnimeMatches.length === 0 && allAnimes.length > 0) {
        finalAnimeMatches = allAnimes.map((doc) => ({ doc, score: 0 }));
      }

      if (finalMovieMatches.length > 1 || finalAnimeMatches.length > 1) {
        await ctx.react('🤔');

        let text = `<b>Multiple Results Found</b>\n`;
        text += `<i>Please choose the exact Movie or Anime</i>\n\n`;

        let count = 1;

        if (finalMovieMatches.length) {
          text += `🎬 <b>Movies</b>\n`;
          for (const m of finalMovieMatches) {
            const enc = Buffer.from(m.doc.name, 'utf-8').toString('base64');
            const link = `https://t.me/${this.boturl}?start=${enc}`;
            const Audio = await this.ExtractAudio(m.doc);
            const Quality = await this.ExtractQuality(m.doc);
            text += `${count}.┎<b>${this.escapeHtml(
              m.doc.name,
            )}</b> → <a href="${link}">Click Here</a>\n`;
            text += `   ┃\n`;
            text += `   ┠ <b>Audio : <i>${this.escapeHtml(
              Audio || 'Unknown',
            )}</i></b>\n`;
            text += `   ┃\n`;
            text += `   ┖ <b>Quality : <i>${this.escapeHtml(
              Quality || 'Unknown',
            )}</i></b>\n\n`;
            count++;
          }
          text += `\n`;
        }

        if (finalAnimeMatches.length) {
          text += `🎌 <b>Animes</b>\n`;
          for (const a of finalAnimeMatches) {
            const enc = Buffer.from(a.doc.name, 'utf-8').toString('base64');
            const link = `https://t.me/${this.animeboturl}?start=${enc}`;
            const Audio = await this.ExtractAudio(a.doc);
            const Quality = await this.ExtractQuality(a.doc);
            text += `${count}. ┎ <b>${this.escapeHtml(
              a.doc.name,
            )}</b> ➻ <a href="${link}">Click Here</a>\n`;
            text += `   ┃\n`;
            text += `   ┠  <b>Audio : <i>${this.escapeHtml(
              Audio || 'Unknown',
            )}</i></b>\n`;
            text += `   ┃\n`;
            text += `   ┖ <b>Quality : <i>${this.escapeHtml(
              Quality || 'Unknown',
            )}</i></b>\n\n`;
            count++;
          }
        }

        const sent = await ctx.reply(text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_to_message_id: ctx.message.message_id,
        });

        await this.tempMessageModel.create({
          chatId: sent.chat.id,
          messageId: sent.message_id,
          userId: ctx.from.id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        const warningMsg = await ctx.reply(
          `
  <b>⚠️ Warning</b>\n
  <blockquote>Due to Copyright issues, Message will be deleted after 5 minutes.\n <b> Forward the message to Saved Message</b>.</blockquote>`,
          {
            parse_mode: 'HTML',
            reply_to_message_id: ctx.message.message_id,
          },
        );

        await this.tempMessageModel.create({
          chatId: warningMsg.chat.id,
          messageId: warningMsg.message_id,
          userId: ctx.from.id,
          expireAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        return;
      }

      if (finalMovieMatches.length === 1) {
        const movie = finalMovieMatches[0].doc;
        if (movie.poster?.chatId && movie.poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id,
            movie.poster.chatId,
            movie.poster.messageId,
          );
          await this.tempMessageModel.create({
            chatId: ctx.chat.id,
            messageId: posterMsg.message_id,
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        }
        console.log('Sending Movie Episode Page');
        return this.sendEpisodePage(ctx, movie, 0);
      }

      if (finalAnimeMatches.length === 1) {
        const anime = finalAnimeMatches[0].doc;
        if (anime.poster?.chatId && anime.poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id,
            anime.poster.chatId,
            anime.poster.messageId,
          );
          await this.tempMessageModel.create({
            chatId: ctx.chat.id,
            messageId: posterMsg.message_id,
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        }
        console.log('Sending Anime Episode Page');
        return this.sendAnimeEpisodePage(ctx, anime, 0);
      }
    } catch (err) {
      console.error('sendMovie error:', err.message);
    }
  }

  async sendMovieName(ctx, name: string) {
    try {
      const searchText = name.trim().toLowerCase();

      console.log('SEARCH TEXT:', searchText);
    console.log(`Movie Request by ${ctx.from.first_name} ${ctx.from.last_name} ${ctx.from.username} ${ctx.from.id}`);


      // 🟡 get all movies
      const movies = await this.movieModel.find();

      if (movies.length === 0) {
        const msg = await ctx.reply(
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Movie is not Available in My Database.</b>\n\n<b>Movie Name Must be in Correct Format</b>\n\n<b><u>Examples for Typing</u></b>\n 1.(Web Series Name) S01 or (Web Series Name) S02 \n2. (Movie Name) \n3. (Web Series Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Movie Available in our bot Using <b> List of Movies</b> </i> \n\n <i>If the Movie is not in the List. Kindly Contact the Admin Using <b>Request Movie</b></i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Request Movie',
                    url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
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
          chatId: msg.chat.id,
          messageId: msg.message_id,
          expireAt: this.expireAt,
        });
        return;
      }

      // 🔥 FUZZY MATCH
      let bestMatch: Movie | null = null;
      let bestScore = 0;

      for (const movie of movies) {
        const score = ratio(searchText, movie.name.toLowerCase());

        if (score > bestScore) {
          bestScore = score;
          bestMatch = movie;
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

      // ❌ no confident match
      const msg = await ctx.reply(
        `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Movie is not Available in My Database.</b>\n\n<b>Movie Name Must be in Correct Format</b>\n\n<b><u>Examples for Typing</u></b>\n 1.(Web Series Name) S01 or (Web Series Name) S02 \n2. (Movie Name) \n3. (Web Series Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Movie Available in our bot Using <b> List of Movies</b> </i> \n\n <i>If the Movie is not in the List. Kindly Contact the Admin Using <b>Request Movie</b></i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Request Movie',
                  url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
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
        chatId: msg.chat.id,
        messageId: msg.message_id,
        expireAt: this.expireAt,
      });
    } catch (err) {
      console.error('sendMovieName error:', err.message);
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

  async requestedMovies(ctx) {
    try{
      const isOwner = this.checkOwner(ctx);
      if (!isOwner) return;
      const requestMovies = await this.requestModel.find();
      if (requestMovies.length === 0) {
        return await ctx.reply(`⚠️ No Requested Movies Found`, {
          parse_mode: 'HTML',
        });
      }

      let msg = `<b><u>Requested Movies</u></b>\n\n`;
      requestMovies.forEach((m, i) => {
        msg += `<b>${i + 1}. <code>${m.name}</code></b>\n`;
      });
      const rm = await ctx.reply(msg, {
        parse_mode: 'HTML',
      });

      await this.tempMessageModel.create({
        chatId: rm.chat.id,
        messageId: rm.message_id,
        expireAt: this.expireAt,
      })
    }catch(err){
      console.log(err);
    }
  }

  async deleteRequestedMovies(ctx){
    try{
      const isOwner = this.checkOwner(ctx);
      if (!isOwner) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if(!input) {
        return await ctx.reply(`⚠️ Please provide a movie name.\n Eg : /drm <movieName>`, {
          parse_mode: 'HTML',
        });
      }
      await this.requestModel.deleteMany({name: input});
      await ctx.reply(`✅ Requested Movie Deleted Successfully`, {
        parse_mode: 'HTML',
      });
    }catch(err){
      console.log(err);
    }
  }

  async about(ctx) {
    await ctx.answerCbQuery();

    try {
      const msg = await ctx.editMessageCaption(
        `<b>🤖 My Name </b>: <a href="https://t.me/lord_fourth_movie5_bot">Movie Bot</a> ⚡️\n<b>📝 Language </b>: <a href="https://nestjs.com/">Nest JS</a>\n<b>🚀 Server </b>: <a href="https://vercel.com/">Vercel</a> \n<b>📢 Channel </b>: <a href="https://t.me/LordFourthMovieTamil">Lord Fourth Movie Tamil</a>`,
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
                  url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
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
          const message = await ctx.telegram.copyMessage(
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

        const message = await ctx.telegram.copyMessage(
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
      console.error('Error while sending handle movie episode:', err.message);
    }
  }

  async handleAnimeEpisodeSelection(ctx) {
    try {
      await ctx.answerCbQuery(); // hide "loading" in Telegram

      const data = ctx.callbackQuery.data as string;

      if (data.startsWith('anime_page_')) {
        const parts = data.split('_');
        const movieId = parts[2];
        const page = parseInt(parts[3], 10);

        const movie = await this.animeModel.findById(movieId);

        if (!movie) return await ctx.reply('❌ Movie not found.');

        // show the requested page
        return this.sendAnimeEpisodePage(ctx, movie, page);
      }

      if (data.startsWith('anime_all_')) {
        const movieId = data.split('_')[2];
        const movie = await this.animeModel.findById(movieId);

        if (!movie) return await ctx.reply('❌ Movie not found.');

        for (const file of movie.files) {
          const message = await ctx.telegram.copyMessage(
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

      if (data.startsWith('anime_file_')) {
        const parts = data.split('_');
        const movieId = parts[2];
        const idx = parseInt(parts[3], 10);

        const movie = await this.animeModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');

        const file = movie.files[idx];
        if (!file) return ctx.reply('❌ File not found.');

        const message = await ctx.telegram.copyMessage(
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
      console.error('Error while sending handle anime episode:', err.message);
    }
  }

  private async sendEpisodePage(ctx, movie, page: number) {
    try {
      const start = page * this.PAGE_SIZE;
      const end = start + this.PAGE_SIZE;

      // 🔴 CHANGE 1: reverse files (DB affect aagadhu)
      const reversedFiles = [...movie.files].reverse();
      const files = reversedFiles.slice(start, end);
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
          .replace(/^@[^-_:]+[-_:]+[_]*\s*/, '') // remove @BotName prefixes with - or _
          .replace(/\.mkv$/i, '');
        const fileSize = file.size || '';
        // 🔴 CHANGE 2: correct index for reversed order
        const originalIndex = movie.files.length - 1 - (start + idx);

        buttons.push([
          {
            text: `[${fileSize}] - ${fileName}`,
            callback_data: `file_${movie._id}_${originalIndex}`,
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
        // console.log('end < anime.files.length', end, movie.files.length);
        navButtons.push({
          text: 'Next ➡️',
          callback_data: `page_${movie._id}_${page + 1}`,
        });
      }
      if (navButtons.length) buttons.push(navButtons);

      if (ctx.updateType === 'callback_query') {
        // edit the inline keyboard when callback
        await ctx.editMessageText(
          `<b>${movie.name} Movie (Page ${page + 1})</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          },
        );
      } else {
        // normal reply when user types anime name
        const msg = await ctx.reply(
          `<b>${movie.name} Movie (Page ${page + 1})</b>`,
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
    } catch (err) {
      console.error('Error sending episode page:', err.message);
    }
  }

  private async sendAnimeEpisodePage(ctx, anime, page: number) {
    try {
      const start = page * this.PAGE_SIZE;
      const end = start + this.PAGE_SIZE;

      // 🔴 CHANGE 1: reverse files (DB affect aagadhu)
      const reversedFiles = [...anime.files].reverse();
      const files = reversedFiles.slice(start, end);
      const totalPages = Math.ceil(anime.files.length / this.PAGE_SIZE);

      const buttons: any[] = [];

      // Send All button only in first page
      if (page === 0) {
        buttons.push([
          { text: '📥 Send All', callback_data: `anime_all_${anime._id}` },
        ]);
      }

      files.forEach((file, idx) => {
        const fileName = file.fileName
          .replace(/^@[^-_:]+[-_:]+[_]*\s*/, '') // remove @BotName prefixes with - or _
          .replace(/\.mkv$/i, '');
        const fileSize = file.size || '';
        // 🔴 CHANGE 2: correct index for reversed order
        const originalIndex = anime.files.length - 1 - (start + idx);

        buttons.push([
          {
            text: `[${fileSize}] - ${fileName}`,
            callback_data: `anime_file_${anime._id}_${originalIndex}`,
          },
        ]);
      });

      // Pagination buttons
      const navButtons: any[] = [];
      if (page > 0) {
        navButtons.push({
          text: '⬅️ Prev',
          callback_data: `anime_page_${anime._id}_${page - 1}`,
        });
      }
      navButtons.push({
        text: `Pages ${page + 1}/${totalPages}`,
        callback_data: 'noop',
      });
      if (end < anime.files.length) {
        // console.log('end < anime.files.length', end, movie.files.length);
        navButtons.push({
          text: 'Next ➡️',
          callback_data: `anime_page_${anime._id}_${page + 1}`,
        });
      }
      if (navButtons.length) buttons.push(navButtons);

      if (ctx.updateType === 'callback_query') {
        // edit the inline keyboard when callback
        await ctx.editMessageText(
          `<b>${anime.name} Anime (Page ${page + 1})</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          },
        );
      } else {
        // normal reply when user types anime name
        const msg = await ctx.reply(
          `<b>${anime.name} Anime (Page ${page + 1})</b>`,
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
    } catch (err) {
      console.log('Error sending anime episode page',err);
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

  findTopMatches(input, docs, minScore = 90) {
    return docs
      .map((doc) => ({
        doc,
        score: ratio(input.toLowerCase(), doc.name.toLowerCase()),
      }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score);
  }

  ExtractAudio(caption) {
    try {
      // if (!caption || typeof caption !== "string") {
      //   return ""; // ❌ no unknown, no null
      // }

      const lines = caption.caption.split('\n');

      for (const line of lines) {
        // matches: 🔈 Audio : Tamil + Multi
        const match = line.match(/audio\s*:\s*(.+)/i);
        if (match) {
          return match[1].trim();
        }
      }

      return ''; // ❌ still no unknown
    } catch (e) {
      console.log(e.message);
      return null;
    }
  }

  ExtractQuality(caption) {
    try {
      const lines = caption.caption.split('\n');
      for (const line of lines) {
        const match = line.match(/Quality\s*:\s*(.+)/i);
        if (match) {
          return match[1].trim();
        }
      }
      return ''; // ❌ still no unknown
    } catch (e) {
      console.log(e.message);
      return null;
    }
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
