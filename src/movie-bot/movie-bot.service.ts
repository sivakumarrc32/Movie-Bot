/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
import { ratio } from 'fuzzball';

import { Movie } from './movie.schema';
import { User } from './user.schema';
import { TempMessage } from './temp.schema';
import { Anime } from 'src/anime/anime.schema';
import { RequestMovies } from './requestMovies.schema';
import { Setting } from './settings.schema';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────

type ChannelInfo = {
  id: string;
  text: string;
  url: string;
};

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

/** Channels users must join before using the bot */
const REQUIRED_CHANNELS: ChannelInfo[] = [
  {
    id: '-1003261050452',
    text: '📢 Join Channel 1',
    url: 'https://t.me/LFT_Movie',
  },
  {
    id: '-1003326848627',
    text: '📢 Join Channel 2',
    url: 'https://t.me/+Ekzqobyp6GY4OGE9',
  },
  {
    id: '-1003847082548',
    text: '📢 Join Channel 3',
    url: 'https://t.me/+5It5cJtwFgU4NTM1',
  },
  {
    id: '-1003579412645',
    text: 'Main Channel',
    url: 'https://t.me/+eowduZXbyy40NmZl',
  },
];

/** Random emojis used when reacting to a user's message */
const REACTION_EMOJIS = [
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

/** How many files to show per page in the episode selector */
const PAGE_SIZE = 10;

/** How many files to list per /list page */
const LIST_PAGE_SIZE = 15;

/** Default TTL for temp messages (2 minutes) */
const DEFAULT_TTL_MS = 2 * 60 * 1000;

/** TTL for movie/file messages (5 minutes – copyright) */
const FILE_TTL_MS = 5 * 60 * 1000;

/** Minimum fuzzy-match score to treat a result as confident */
const FUZZY_MIN_SCORE = 90;

// ─────────────────────────────────────────────
//  Service
// ─────────────────────────────────────────────

@Injectable()
export class MovieBotService implements OnModuleInit {
  public bot: Telegraf;
  public ownerId: number;
  private boturl = '';
  private animeboturl = '';

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

  // ════════════════════════════════════════════
  //  Lifecycle
  // ════════════════════════════════════════════

  async onModuleInit() {
    await this.loadBotUrls();
    this.registerHandlers();
  }

  /** Load bot URL settings from the database (or create defaults) */
  private async loadBotUrls() {
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

  /** Register all bot commands and actions in one place */
  private registerHandlers() {
    // ── Commands ──────────────────────────────
    this.bot.start(async (ctx) => {
      try {
        await this.reactMessage(ctx);
      } catch (e) {
        console.log(e);
      }

      // Decode the optional deep-link payload
      let payload =
        ctx.payload || ctx.message?.text?.split(' ').slice(1).join(' ');
      if (payload) {
        try {
          payload = Buffer.from(payload, 'base64').toString('utf-8');
        } catch {
          payload = decodeURIComponent(payload);
        }
      }
      await this.start(ctx, payload);
    });

    this.bot.command('help', (ctx) => this.help(ctx));
    this.bot.command('list', (ctx) => this.sendMovieList(ctx, 1, false));
    this.bot.command('rm', (ctx) => this.requestedMovies(ctx));
    this.bot.command('drm', (ctx) => this.deleteRequestedMovies(ctx));
    this.bot.command('sm', (ctx) => this.searchMovie(ctx));
    this.bot.command('dm', (ctx) => this.deleteMovieInDB(ctx));
    this.bot.command('broadcast', (ctx) => this.broadcast(ctx));

    // ── Inline-keyboard actions ───────────────
    this.bot.action(/^list_page_(\d+)$/, (ctx) => {
      const page = parseInt(ctx.match[1]);
      return this.sendMovieList(ctx, page, true);
    });

    this.bot.action('list', (ctx) => this.sendMovieList(ctx, 1, false));
    this.bot.action('help', (ctx) => this.help(ctx));
    this.bot.action('about', (ctx) => this.about(ctx));
    this.bot.action('backToStart', (ctx) => this.backToStart(ctx));
    this.bot.action('noop', async (ctx) =>
      ctx.answerCbQuery('❌ This is Not a Button'),
    );

    this.bot.action('check_join', async (ctx) => {
      const joined = await this.checkSubscription(ctx);
      if (joined) {
        await ctx.answerCbQuery('✅ You have joined the channels!');
        await this.start(ctx);
      } else {
        await ctx.answerCbQuery('❌ Please join all channels first!', {
          show_alert: true,
        });
      }
    });

    // Movie & Anime episode selectors
    this.bot.action(/^(all|file|page)_/, (ctx) =>
      this.handleEpisodeSelection(ctx),
    );
    this.bot.action(/^(anime_all|anime_file|anime_page)_/, (ctx) =>
      this.handleAnimeEpisodeSelection(ctx),
    );

    // ── Plain text → search ───────────────────
    this.bot.on('text', (ctx) => this.sendMovie(ctx));
  }

  // ════════════════════════════════════════════
  //  Auth helpers
  // ════════════════════════════════════════════

  /** Returns true only if the sender is the bot owner */
  private checkOwner(ctx: any): boolean {
    if (ctx.from.id !== this.ownerId) {
      ctx.reply(
        '<b>🚫 You are not authorized to use this bot.</b>\n\n\n @lord_fourth_movie6_bot Here You Can Get the Movies',
        { parse_mode: 'HTML' },
      );
      return false;
    }
    return true;
  }

  /**
   * Checks whether the user has joined all required channels.
   * If not, sends a prompt with Join buttons.
   * Returns true if the user has joined all channels.
   */
  private async checkSubscription(ctx: any): Promise<boolean> {
    try {
      const notJoined: ChannelInfo[] = [];

      for (const channel of REQUIRED_CHANNELS) {
        const member = await ctx.telegram.getChatMember(
          channel.id,
          ctx.from.id,
        );
        if (member.status === 'left' || member.status === 'kicked') {
          notJoined.push(channel);
        }
      }

      if (notJoined.length === 0) return true; // ✅ already joined all

      // Build 2-column keyboard of unchained channels
      const keyboard: any[] = [];
      for (let i = 0; i < notJoined.length; i += 2) {
        keyboard.push(
          notJoined
            .slice(i, i + 2)
            .map((ch) => ({ text: ch.text, url: ch.url })),
        );
      }
      keyboard.push([{ text: '🔄 Try Again', callback_data: 'check_join' }]);

      await ctx.replyWithAnimation(
        'CgACAgUAAxkBAAMDaZOD5ZrjO1oq0Vf35zc94pMr85cAAl0aAAIat6FUhnSrPBydTqM6BA',
        {
          caption:
            `Hi ${ctx.from.first_name},\n\n` +
            `<b>Innum sila channel la join pannanum</b>\n\n` +
            `Movies & updates miss aagama irukka\n` +
            `👇 keela irukkura channel la join pannunga`,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        },
      );
      return false;
    } catch (err) {
      console.error('checkSubscription error:', err.message);
      return false;
    }
  }

  // ════════════════════════════════════════════
  //  /start  –  Welcome screen
  // ════════════════════════════════════════════

  async start(ctx: any, payload?: string) {
    try {
      const isJoined = await this.checkSubscription(ctx);
      if (!isJoined) return;

      // If bot was opened via a deep-link, send that movie directly
      if (payload) {
        await this.sendMovieName(ctx, payload);
        return;
      }

      const userName = ctx.from.username;
      const msg = await ctx.replyWithAnimation(
        'CgACAgUAAxkBAAMDaZOD5ZrjO1oq0Vf35zc94pMr85cAAl0aAAIat6FUhnSrPBydTqM6BA',
        {
          caption:
            `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a>\n\n` +
            `<i>I'm your friendly Movie Bot 🤖</i>\n\n` +
            `<b>Here, you can get movie files directly</b> — no link shorteners, no ads, just pure movies! 🍿\n\n` +
            `👉 <b>Send the correct movie name</b>, and if it's available in my database, you'll get the <b>file instantly!</b>\n\n` +
            `⚡<i>Enjoy your movie time! 🎥💫</i>`,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Movie Bot',
                  url: 'https://t.me/lord_fourth_movie6_bot',
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
                { text: '⚙️ Support', url: 'https://t.me/+JH-KR5ZMJUQyNzI1' },
              ],
              [{ text: 'Developer', url: 'https://t.me/Lord_Fourth04' }],
            ],
          },
        },
      );

      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        DEFAULT_TTL_MS,
        ctx.from.id,
      );
      await this.saveUserIfNew(ctx);
    } catch (err) {
      console.error('start error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  /help  –  Usage instructions
  // ════════════════════════════════════════════

  async help(ctx: any) {
    try {
      const msg = await ctx.reply(
        `<u><b>Available Commands</b></u>\n\n` +
          `👉🏻 1. /list  – See all available movies.\n\n` +
          `👉🏻 2. /help  – View commands.\n\n` +
          `✨ Just type the movie name to get movie instantly!\n\n` +
          `<i><b>Note:</b> Type the movie name correctly to get files.</i>\n\n` +
          `<u>Steps to Get a Movie File</u>\n\n` +
          `<b>Step 1:</b> Use /list to get the movie list.\n\n` +
          `<b>Step 2:</b> If the movie is in the list, <b>press the movie name — it will be copied.</b>\n\n` +
          `<b>Step 3:</b> Paste & send the name. You'll receive the files.\n\n` +
          `<b>Step 4:</b> Forward the file to your friends or Saved Messages.\n\n` +
          `<b>Files are deleted after 5 mins due to copyright.</b>\n\n` +
          `<i><b>Thanks for using our Bot ❤️</b></i>`,
        { parse_mode: 'HTML' },
      );
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        DEFAULT_TTL_MS,
        ctx.from.id,
      );
    } catch (err) {
      console.error('help error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  /list  –  Paginated movie list
  // ════════════════════════════════════════════

  async sendMovieList(ctx: any, page = 1, isEdit = false) {
    try {
      const skip = (page - 1) * LIST_PAGE_SIZE;
      const totalMovies = await this.movieModel.countDocuments();
      const totalPages = Math.ceil(totalMovies / LIST_PAGE_SIZE);
      const movies = await this.movieModel
        .find({}, 'name')
        .skip(skip)
        .limit(LIST_PAGE_SIZE);

      if (!movies.length) {
        return ctx.reply('<b>😢 No movies available.</b>', {
          parse_mode: 'HTML',
        });
      }

      let msg = `<b><u>Available Movies:</u></b>\n\n🎬 <b>Page ${page}</b>\n\n`;
      movies.forEach((m, i) => {
        msg += `<b>${skip + i + 1}. <code>${m.name}</code></b>\n`;
      });
      msg += `\n👉 Type the <b>Movie Name</b> to get movie.\n`;

      // Prev / page counter / Next buttons
      const navButtons: any[] = [];
      if (page > 1)
        navButtons.push({
          text: '⬅️ Back',
          callback_data: `list_page_${page - 1}`,
        });
      navButtons.push({
        text: `Pages: ${page}/${totalPages}`,
        callback_data: 'noop',
      });
      if (skip + LIST_PAGE_SIZE < totalMovies)
        navButtons.push({
          text: 'Next ➡️',
          callback_data: `list_page_${page + 1}`,
        });

      const opts = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [navButtons] },
      };

      if (isEdit) {
        await ctx.editMessageText(msg, opts);
      } else {
        await ctx.reply(msg, opts);
      }
    } catch (err) {
      console.error('sendMovieList error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Plain text handler  –  Search by name
  // ════════════════════════════════════════════

  /**
   * Called for every plain-text message.
   * 1. Validates the query (no "Season" keyword).
   * 2. Runs a regex search in the DB followed by fuzzy matching.
   * 3. Sends: a picker list (multiple results), an episode page (single result),
   *    or a "not found" message.
   */
  async sendMovie(ctx: any) {
    if (ctx.message.text.startsWith('/')) return; // ignore commands

    console.log(
      `Movie Request by ${ctx.from.first_name} ${ctx.from.last_name} ${ctx.from.username} ${ctx.from.id}`,
    );

    try {
      const rawText = ctx.message.text.trim();
      const yearMatch = rawText.match(/\b\d{4}\b/);
      const year = yearMatch ? Number(yearMatch[0]) : null;
      const searchName = rawText;

      // Guard: user must not type "Season" / "season"
      const words = searchName.split(' ');
      if (words.includes('Season') || words.includes('season')) {
        const warnMsg = await ctx.reply(
          `<blockquote><b>❌ Please Don't Use Season or season</b></blockquote>\n\n` +
            `<b>Example:</b>\nGame of Thrones S01 ✅\nGame of Thrones S02 ✅`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: 'Rules', callback_data: 'help' }]],
            },
            reply_to_message_id: ctx.message.message_id,
          },
        );
        await this.saveTempMessage(
          warnMsg.chat.id,
          warnMsg.message_id,
          FILE_TTL_MS,
          ctx.from.id,
        );
        return;
      }

      // DB search  (year is optional)
      const query: any = { name: { $regex: searchName, $options: 'i' } };
      if (year) query.year = year;

      const allMovies = await this.movieModel.find(query);
      const allAnimes = await this.animeModel.find(query);

      // Fuzzy filter on top of the regex results
      let movieMatches = this.findTopMatches(searchName, allMovies);
      let animeMatches = this.findTopMatches(searchName, allAnimes);

      // Nothing at all → save request & show "not found"
      if (allMovies.length === 0 && allAnimes.length === 0) {
        await this.requestModel.create({
          name: searchName,
          userId: ctx.from.id.toString(),
          userName: ctx.from.first_name || ctx.from.username,
        });
        const msg = await this.replyNotFound(ctx, searchName);
        await this.saveTempMessage(ctx.chat.id, msg.message_id, DEFAULT_TTL_MS);
        return;
      }

      // Fallback: DB hit but fuzzy came up empty → use DB results as-is
      if (movieMatches.length === 0 && allMovies.length > 0)
        movieMatches = allMovies.map((doc) => ({ doc, score: 0 }));
      if (animeMatches.length === 0 && allAnimes.length > 0)
        animeMatches = allAnimes.map((doc) => ({ doc, score: 0 }));

      // ── Multiple results → show picker ───────
      if (movieMatches.length > 1 || animeMatches.length > 1) {
        await ctx.react('🤔');
        await this.sendMultipleResultsPicker(
          ctx,
          movieMatches,
          animeMatches,
          searchName,
        );
        return;
      }

      // ── Single movie result ───────────────────
      if (movieMatches.length === 1) {
        const movie = movieMatches[0].doc;
        await this.tryCopyPoster(ctx, movie);
        return this.sendEpisodePage(ctx, movie, 0);
      }

      // ── Single anime result ───────────────────
      if (animeMatches.length === 1) {
        const anime = animeMatches[0].doc;
        await this.tryCopyPoster(ctx, anime);
        return this.sendAnimeEpisodePage(ctx, anime, 0);
      }
    } catch (err) {
      console.error('sendMovie error:', err.message);
    }
  }

  /**
   * Used when the bot is opened with a deep-link payload (e.g. from a shared link).
   * Does a fuzzy match over ALL movies and sends the best result if score ≥ 90.
   */
  async sendMovieName(ctx: any, name: string) {
    try {
      const searchText = name.trim().toLowerCase();
      console.log('sendMovieName:', searchText);

      const movies = await this.movieModel.find();

      if (movies.length === 0) {
        const msg = await this.replyNotFound(ctx, name);
        await this.saveTempMessage(msg.chat.id, msg.message_id, DEFAULT_TTL_MS);
        return;
      }

      // Find the best fuzzy match
      let bestMatch: Movie | null = null;
      let bestScore = 0;
      for (const movie of movies) {
        const score = ratio(searchText, movie.name.toLowerCase());
        if (score > bestScore) {
          bestScore = score;
          bestMatch = movie;
        }
      }

      console.log('Best match:', bestMatch?.name, bestScore);

      if (bestMatch && bestScore >= FUZZY_MIN_SCORE) {
        await this.tryCopyPoster(ctx, bestMatch);
        return this.sendEpisodePage(ctx, bestMatch, 0);
      }

      // No confident match
      const msg = await this.replyNotFound(ctx, name);
      await this.saveTempMessage(msg.chat.id, msg.message_id, DEFAULT_TTL_MS);
    } catch (err) {
      console.error('sendMovieName error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Episode page  –  Movie
  // ════════════════════════════════════════════

  /**
   * Sends (or edits) an inline keyboard showing one page of episode/file buttons.
   * Files are shown in reverse order so the latest episode appears first.
   */
  private async sendEpisodePage(ctx: any, movie: any, page: number) {
    try {
      const reversedFiles = [...movie.files].reverse();
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const files = reversedFiles.slice(start, end);
      const totalPages = Math.ceil(movie.files.length / PAGE_SIZE);

      const buttons: any[] = [];

      // "Send All" only on the first page
      if (page === 0) {
        buttons.push([
          { text: '📥 Send All', callback_data: `all_${movie._id}` },
        ]);
      }

      // Individual file buttons
      files.forEach((file: any, idx: number) => {
        const label = file.fileName
          .replace(/^@\S+\s*[:-]*\s*/, '')
          .replace(/\.mkv$/i, '');
        const size = file.size || '';
        const originalIndex = movie.files.length - 1 - (start + idx); // correct for reversed order
        buttons.push([
          {
            text: `[${size}] - ${label}`,
            callback_data: `file_${movie._id}_${originalIndex}`,
          },
        ]);
      });

      // Pagination nav row
      buttons.push(
        this.buildNavButtons(
          `page_${movie._id}`,
          page,
          totalPages,
          movie.files.length,
          end,
        ),
      );

      const caption = `<b>${movie.name} Movie (Page ${page + 1})</b>`;
      await this.replyOrEditEpisodePage(ctx, caption, buttons, movie);
    } catch (err) {
      console.error('sendEpisodePage error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Episode page  –  Anime
  // ════════════════════════════════════════════

  private async sendAnimeEpisodePage(ctx: any, anime: any, page: number) {
    try {
      const reversedFiles = [...anime.files].reverse();
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const files = reversedFiles.slice(start, end);
      const totalPages = Math.ceil(anime.files.length / PAGE_SIZE);

      const buttons: any[] = [];

      if (page === 0) {
        buttons.push([
          { text: '📥 Send All', callback_data: `anime_all_${anime._id}` },
        ]);
      }

      files.forEach((file: any, idx: number) => {
        const label = file.fileName
          .replace(/^@[^-_:]+[-_:]+[_]*\s*/, '')
          .replace(/\.mkv$/i, '');
        const size = file.size || '';
        const originalIndex = anime.files.length - 1 - (start + idx);
        buttons.push([
          {
            text: `[${size}] - ${label}`,
            callback_data: `anime_file_${anime._id}_${originalIndex}`,
          },
        ]);
      });

      buttons.push(
        this.buildNavButtons(
          `anime_page_${anime._id}`,
          page,
          totalPages,
          anime.files.length,
          end,
        ),
      );

      const caption = `<b>${anime.name} Anime (Page ${page + 1})</b>`;
      await this.replyOrEditEpisodePage(ctx, caption, buttons, anime);
    } catch (err) {
      console.error('sendAnimeEpisodePage error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Callback handlers  –  Movie episode actions
  // ════════════════════════════════════════════

  /**
   * Handles three kinds of movie callbacks:
   *  - page_<id>_<n>  → navigate pages
   *  - all_<id>       → send all files
   *  - file_<id>_<n>  → send a single file
   */
  async handleEpisodeSelection(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data;

      if (data.startsWith('page_')) {
        const [, movieId, pageStr] = data.split('_');
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');
        return this.sendEpisodePage(ctx, movie, parseInt(pageStr, 10));
      }

      if (data.startsWith('all_')) {
        const movieId = data.split('_')[1];
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');
        await this.sendAllFiles(ctx, movie.files, movie.name);
        return;
      }

      if (data.startsWith('file_')) {
        const [, movieId, idxStr] = data.split('_');
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');
        const file = movie.files[parseInt(idxStr, 10)];
        if (!file) return ctx.reply('❌ File not found.');
        await this.sendSingleFile(ctx, file, movie.name);
        return;
      }
    } catch (err) {
      console.error('handleEpisodeSelection error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Callback handlers  –  Anime episode actions
  // ════════════════════════════════════════════

  async handleAnimeEpisodeSelection(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data;

      if (data.startsWith('anime_page_')) {
        const parts = data.split('_'); // ['anime','page',<id>,<n>]
        const animeId = parts[2];
        const page = parseInt(parts[3], 10);
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendAnimeEpisodePage(ctx, anime, page);
      }

      if (data.startsWith('anime_all_')) {
        const animeId = data.split('_')[2];
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        await this.sendAllFiles(ctx, anime.files, anime.name);
        return;
      }

      if (data.startsWith('anime_file_')) {
        const parts = data.split('_'); // ['anime','file',<id>,<n>]
        const animeId = parts[2];
        const idx = parseInt(parts[3], 10);
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        const file = anime.files[idx];
        if (!file) return ctx.reply('❌ File not found.');
        await this.sendSingleFile(ctx, file, anime.name);
        return;
      }
    } catch (err) {
      console.error('handleAnimeEpisodeSelection error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  About & Back-to-start actions
  // ════════════════════════════════════════════

  async about(ctx: any) {
    await ctx.answerCbQuery();
    try {
      const msg = await ctx.editMessageCaption(
        `<b>🤖 My Name</b>: <a href="https://t.me/lord_fourth_movie6_bot">Movie Bot</a> ⚡️\n` +
          `<b>📝 Language</b>: <a href="https://nestjs.com/">Nest JS</a>\n` +
          `<b>🚀 Server</b>: <a href="https://vercel.com/">Vercel</a>\n` +
          `<b>📢 Channel</b>: <a href="https://t.me/LordFourthMovieTamil">Lord Fourth Movie Tamil</a>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Back', callback_data: 'backToStart' }],
            ],
          },
        },
      );
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        DEFAULT_TTL_MS,
        ctx.from.id,
      );
    } catch (err) {
      console.error('about error:', err.message);
    }
  }

  async backToStart(ctx: any) {
    await ctx.answerCbQuery();
    try {
      const msg = await ctx.editMessageCaption(
        `👋 <b>Welcome to Movie Bot!</b>\n\n` +
          `<i>Available Commands</i>\n\n` +
          `1. /list  – See all available movies.\n` +
          `2. /help  – View bot commands.\n\n` +
          `✨ Just type the movie name to get it instantly!`,
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
                { text: '⚙️ Support', url: 'https://t.me/+JH-KR5ZMJUQyNzI1' },
              ],
              [{ text: 'Developer', url: 'https://t.me/Lord_Fourth04' }],
            ],
          },
        },
      );
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        DEFAULT_TTL_MS,
        ctx.from.id,
      );
    } catch (err) {
      console.error('backToStart error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Admin commands  (owner-only)
  // ════════════════════════════════════════════

  /** /broadcast  – Send a message to all registered users */
  async broadcast(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const text = ctx.message.text.split(' ').slice(1).join(' ');
      if (!text) return ctx.reply('⚠️ Please provide a message.');
      await this.sendBroadcast(text);
      await ctx.reply('✅ Broadcast sent!');
    } catch (err) {
      console.error('broadcast error:', err.message);
    }
  }

  /** /rm  – List all pending movie requests */
  async requestedMovies(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const requests = await this.requestModel.find();
      if (!requests.length)
        return ctx.reply('⚠️ No Requested Movies Found', {
          parse_mode: 'HTML',
        });

      let msg = `<b><u>Requested Movies</u></b>\n\n`;
      requests.forEach((m, i) => {
        msg += `<b>${i + 1}. <code>${m.name}</code></b>\n`;
      });

      const rm = await ctx.reply(msg, { parse_mode: 'HTML' });
      await this.saveTempMessage(rm.chat.id, rm.message_id, DEFAULT_TTL_MS);
    } catch (err) {
      console.error('requestedMovies error:', err);
    }
  }

  /** /drm <name>  – Delete a movie request from the list */
  async deleteRequestedMovies(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply(
          '⚠️ Please provide a movie name.\nEg: /drm <movieName>',
          { parse_mode: 'HTML' },
        );
      await this.requestModel.deleteMany({ name: input });
      await ctx.reply('✅ Requested Movie Deleted Successfully', {
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('deleteRequestedMovies error:', err);
    }
  }

  /** /sm <name>  – Search for a movie in the DB (admin debug tool) */
  async searchMovie(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply(
          '⚠️ Please provide a movie name.\nEg: /sm <movieName>',
          { parse_mode: 'HTML' },
        );

      const movies = await this.movieModel.find({ name: input });
      if (!movies.length) return ctx.reply('No Movies Found for the input');

      if (movies.length > 1) {
        let msg = '';
        movies.forEach((m) => {
          msg += `<blockquote><code>${m.name}</code>\n${m.caption}</blockquote>`;
        });
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      const movie = movies[0];
      await ctx.reply(
        `The Movie in Database\n\n<blockquote>${movie.caption}</blockquote>`,
        { parse_mode: 'HTML' },
      );
      await ctx.reply('✅ Movie shown successfully', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('searchMovie error:', err);
    }
  }

  /** /dm <name>  – Delete a movie from the DB */
  async deleteMovieInDB(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply(
          '⚠️ Please provide a movie name.\nEg: /dm <movieName>',
          { parse_mode: 'HTML' },
        );
      await this.movieModel.deleteOne({ name: input });
      await ctx.reply('✅ Movie Deleted Successfully', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('deleteMovieInDB error:', err);
    }
  }

  // ════════════════════════════════════════════
  //  Broadcast helper
  // ════════════════════════════════════════════

  /** Sends a message to every user in the DB. Removes inactive users automatically. */
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
          const errorMsg: string = err.message || '';
          const isInactive =
            errorMsg.includes('bot was blocked by the user') ||
            errorMsg.includes('user is deactivated') ||
            errorMsg.includes('chat not found');

          if (isInactive) {
            console.log(`🗑️ Removing inactive user: ${user.telegramId}`);
            await this.userModel.deleteOne({ telegramId: user.telegramId });
          } else {
            console.error(`⚠️ Error sending to ${user.telegramId}:`, errorMsg);
          }
        }
      }

      console.log(`✅ Broadcast sent to ${users.length} users`);
    } catch (err) {
      console.error('sendBroadcast error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Reaction helper
  // ════════════════════════════════════════════

  /** Puts a random emoji reaction on the user's message */
  async reactMessage(ctx: any) {
    try {
      const emoji =
        REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
      await ctx.telegram.setMessageReaction(
        ctx.chat.id,
        ctx.message.message_id,
        [{ type: 'emoji', emoji }],
        { is_big: true },
      );
    } catch (err) {
      console.error('reactMessage error:', err);
    }
  }

  // ════════════════════════════════════════════
  //  Private utility methods
  // ════════════════════════════════════════════

  /** Saves a new user to the DB if they haven't used the bot before */
  private async saveUserIfNew(ctx: any) {
    const exists = await this.userModel.findOne({ telegramId: ctx.from.id });
    if (!exists) {
      await this.userModel.create({
        telegramId: ctx.from.id,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
        languageCode: ctx.from.language_code,
        isBot: ctx.from.is_bot,
      });
    }
  }

  /** Saves a message ID so the cleanup job can delete it later */
  private async saveTempMessage(
    chatId: number,
    messageId: number,
    ttlMs: number,
    userId?: number,
  ) {
    await this.tempMessageModel.create({
      chatId,
      messageId,
      userId,
      expireAt: new Date(Date.now() + ttlMs),
    });
  }

  /** Copies the movie/anime poster to the chat if one is stored in the DB */
  private async tryCopyPoster(ctx: any, doc: any) {
    if (doc.poster?.chatId && doc.poster?.messageId) {
      const posterMsg = await ctx.telegram.copyMessage(
        ctx.chat.id,
        doc.poster.chatId,
        doc.poster.messageId,
      );
      await this.saveTempMessage(
        ctx.chat.id,
        posterMsg.message_id,
        FILE_TTL_MS,
      );
    }
  }

  /**
   * Copies all files in a list to the user's chat and
   * sends a "sent successfully" + warning message.
   */
  private async sendAllFiles(ctx: any, files: any[], name: string) {
    for (const file of files) {
      const message = await ctx.telegram.copyMessage(
        ctx.chat.id,
        file.chatId,
        file.messageId,
      );
      await this.saveTempMessage(
        ctx.chat.id,
        message.message_id,
        FILE_TTL_MS,
        ctx.from.id,
      );
    }
    await this.replyFilesSent(ctx, name);
  }

  /** Copies a single file to the user's chat */
  private async sendSingleFile(ctx: any, file: any, name: string) {
    const message = await ctx.telegram.copyMessage(
      ctx.chat.id,
      file.chatId,
      file.messageId,
    );
    await this.saveTempMessage(
      ctx.chat.id,
      message.message_id,
      FILE_TTL_MS,
      ctx.from.id,
    );
    await this.replyFilesSent(ctx, name);
  }

  /** Sends the "✅ sent + ⏳ 5-min warning" pair of messages */
  private async replyFilesSent(ctx: any, name: string) {
    const successMsg = await ctx.reply(
      `✅ <b>"${name}" sent successfully!</b>\n\n` +
        `🍿 Enjoy watching.\n\n` +
        `<b>⏳ Files will be deleted after 5 mins.</b>\n\n` +
        `<b>Please forward to Saved Messages or your friends.</b>`,
      { parse_mode: 'HTML' },
    );
    await this.saveTempMessage(
      ctx.chat.id,
      successMsg.message_id,
      FILE_TTL_MS,
      ctx.from.id,
    );
  }

  /**
   * Sends a formatted list when multiple movies/animes match the query.
   * Each entry shows Audio, Quality and a deep-link to fetch that title.
   */
  private async sendMultipleResultsPicker(
    ctx: any,
    movieMatches: any[],
    animeMatches: any[],
    searchName: string,
  ) {
    let text = `<b>Multiple Results Found</b>\n<i>Please choose the exact Movie or Anime</i>\n\n`;
    let count = 1;

    if (movieMatches.length) {
      text += `🎬 <b>Movies</b>\n`;
      for (const m of movieMatches) {
        const enc = Buffer.from(m.doc.name, 'utf-8').toString('base64');
        const link = `https://t.me/${this.boturl}?start=${enc}`;
        const audio = this.extractAudio(m.doc) || 'Unknown';
        const qual = this.extractQuality(m.doc) || 'Unknown';
        text += `${count}.┎<b>${this.escapeHtml(m.doc.name)}</b> → <a href="${link}">Click Here</a>\n`;
        text += `   ┃\n`;
        text += `   ┠ <b>Audio : <i>${this.escapeHtml(audio)}</i></b>\n`;
        text += `   ┃\n`;
        text += `   ┖ <b>Quality : <i>${this.escapeHtml(qual)}</i></b>\n\n`;
        count++;
      }
    }

    if (animeMatches.length) {
      text += `🎌 <b>Animes</b>\n`;
      for (const a of animeMatches) {
        const enc = Buffer.from(a.doc.name, 'utf-8').toString('base64');
        const link = `https://t.me/${this.animeboturl}?start=${enc}`;
        const audio = this.extractAudio(a.doc) || 'Unknown';
        const qual = this.extractQuality(a.doc) || 'Unknown';
        text += `${count}. ┎ <b>${this.escapeHtml(a.doc.name)}</b> ➻ <a href="${link}">Click Here</a>\n`;
        text += `   ┃\n`;
        text += `   ┠  <b>Audio : <i>${this.escapeHtml(audio)}</i></b>\n`;
        text += `   ┃\n`;
        text += `   ┖ <b>Quality : <i>${this.escapeHtml(qual)}</i></b>\n\n`;
        count++;
      }
    }

    const sent = await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: ctx.message.message_id,
    });
    await this.saveTempMessage(
      sent.chat.id,
      sent.message_id,
      FILE_TTL_MS,
      ctx.from.id,
    );

    const warn = await ctx.reply(
      `<b>⚠️ Warning</b>\n\n<blockquote>Due to Copyright issues, messages will be deleted after 5 minutes.\n<b>Forward the message to Saved Messages.</b></blockquote>`,
      { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id },
    );
    await this.saveTempMessage(
      warn.chat.id,
      warn.message_id,
      FILE_TTL_MS,
      ctx.from.id,
    );
  }

  /** Sends the standard "movie not found" reply and returns the sent message */
  private async replyNotFound(ctx: any, searchName: string) {
    return ctx.reply(
      `<i>Hello ${ctx.from.first_name}</i>\n\n` +
        `<b>🚫 Requested Movie is not Available in My Database.</b>\n\n` +
        `<b>Movie Name Must be in Correct Format</b>\n\n` +
        `<b><u>Examples</u></b>\n` +
        ` 1. (Web Series Name) S01  or  (Web Series Name) S02\n` +
        ` 2. (Movie Name)\n` +
        ` 3. (Web Series Name)\n\n` +
        `<b>Note:</b>\n\n` +
        `<i>Check the spelling or use <b>List of Movies</b>.\n` +
        `If not in the list, contact Admin via <b>Request Movie</b>.</i>`,
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
                text: 'Request Movie in Group',
                url: 'https://t.me/+JH-KR5ZMJUQyNzI1',
              },
            ],
          ],
        },
      },
    );
  }

  /**
   * Either edits the current bot message (pagination callback) or
   * sends a fresh reply (user typed a name).
   */
  private async replyOrEditEpisodePage(
    ctx: any,
    caption: string,
    buttons: any[],
    doc: any,
  ) {
    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } else {
      const msg = await ctx.reply(caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        FILE_TTL_MS,
        ctx.from.id,
      );
    }
  }

  /**
   * Builds the Prev / page-counter / Next navigation row.
   * Returns an array of button objects (may be empty if there is only one page).
   */
  private buildNavButtons(
    prefix: string,
    page: number,
    totalPages: number,
    totalFiles: number,
    end: number,
  ): any[] {
    const nav: any[] = [];
    if (page > 0)
      nav.push({ text: '⬅️ Prev', callback_data: `${prefix}_${page - 1}` });
    nav.push({
      text: `Pages ${page + 1}/${totalPages}`,
      callback_data: 'noop',
    });
    if (end < totalFiles)
      nav.push({ text: 'Next ➡️', callback_data: `${prefix}_${page + 1}` });
    return nav;
  }

  // ════════════════════════════════════════════
  //  Fuzzy-search helpers
  // ════════════════════════════════════════════

  /** Returns all docs whose name fuzzy-matches `input` above `minScore` (default 90) */
  findTopMatches(input: string, docs: any[], minScore = FUZZY_MIN_SCORE) {
    return docs
      .map((doc) => ({
        doc,
        score: ratio(input.toLowerCase(), doc.name.toLowerCase()),
      }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score);
  }

  // ════════════════════════════════════════════
  //  Caption parsers  (Audio / Quality)
  // ════════════════════════════════════════════

  /** Extracts the audio line from a movie/anime's caption field */
  private extractAudio(doc: any): string | null {
    try {
      for (const line of doc.caption.split('\n')) {
        const match = line.match(/audio\s*:\s*(.+)/i);
        if (match) return match[1].trim();
      }
      return '';
    } catch (e) {
      console.log(e.message);
      return null;
    }
  }

  /** Extracts the quality line from a movie/anime's caption field */
  private extractQuality(doc: any): string | null {
    try {
      for (const line of doc.caption.split('\n')) {
        const match = line.match(/Quality\s*:\s*(.+)/i);
        if (match) return match[1].trim();
      }
      return '';
    } catch (e) {
      console.log(e.message);
      return null;
    }
  }

  // ════════════════════════════════════════════
  //  String utilities
  // ════════════════════════════════════════════

  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
