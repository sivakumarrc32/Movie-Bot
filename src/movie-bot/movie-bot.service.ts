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
  '👍', '👎', '❤️', '🔥', '🎉', '🤩', '😱',
  '😁', '😢', '💩', '🤮', '🥰', '🤯', '🤔', '🤬', '👏',
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

/**
 * How many results to show per page in both picker flows:
 *   - sendMoviePickerPage        (deep-link / mpick_ callbacks)
 *   - sendMultipleResultsPicker  (plain-text / smpick_ callbacks)
 */
const PICKER_PAGE_SIZE = 5;

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

    // Pagination – deep-link multiple-match picker (sendMoviePickerPage)
    this.bot.action(/^mpick_(\d+)$/, (ctx) =>
      this.handleMultipleMoviePicker(ctx),
    );

    // Pagination – plain-text multiple-match picker (sendMultipleResultsPicker)
    this.bot.action(/^smpick_(\d+)$/, (ctx) =>
      this.handleSendMultiplePicker(ctx),
    );

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

      if (notJoined.length === 0) return true;

      // Build 2-column keyboard of unjoined channels
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
                { text: 'Movie Bot', url: 'https://t.me/lord_fourth_movie6_bot' },
                { text: 'Anime Bot', url: 'https://t.me/lord_fourth_anime_bot' },
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
   * 3. Sends: a paginated picker (multiple results), an episode page (single
   *    result), or a "not found" message.
   */
  async sendMovie(ctx: any) {
    if (ctx.message.text.startsWith('/')) return;

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

      // DB search (year is optional)
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

      // ── Multiple results → paginated picker ──
      if (movieMatches.length > 1 || animeMatches.length > 1) {
        await ctx.react('🤔');
        await this.sendMultipleResultsPicker(ctx, movieMatches, animeMatches, 0);
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

  // ════════════════════════════════════════════
  //  Deep-link entry  –  /start with payload
  // ════════════════════════════════════════════

  /**
   * Called when the bot is opened via a deep-link (/start <payload>).
   *
   * Two payload formats:
   *   1. plain name        → base64(movieName)
   *   2. exact name + year → base64(movieName|year)  ← from picker links
   *
   * Logic:
   *   - If payload has "|year" → exact DB lookup (name + year).
   *   - Otherwise → fuzzy match over all movies.
   *   - Single match  → episode page.
   *   - Multiple matches → paginated picker (mpick_).
   */
  async sendMovieName(ctx: any, name: string) {
    try {
      // ── Parse payload ────────────────────────────────────────────────────────
      const pipeIdx = name.lastIndexOf('|');
      const yearFromPayload =
        pipeIdx !== -1 ? parseInt(name.slice(pipeIdx + 1), 10) : null;
      const nameFromPayload = pipeIdx !== -1 ? name.slice(0, pipeIdx) : name;

      const searchText = nameFromPayload.trim().toLowerCase();
      console.log('sendMovieName:', searchText, 'year:', yearFromPayload);

      const movies = await this.movieModel.find();

      if (movies.length === 0) {
        const msg = await this.replyNotFound(ctx, nameFromPayload);
        await this.saveTempMessage(msg.chat.id, msg.message_id, DEFAULT_TTL_MS);
        return;
      }

      // ── Exact lookup when name|year payload ──────────────────────────────────
      if (yearFromPayload) {
        const exact = movies.find(
          (m) =>
            m.name.toLowerCase() === searchText &&
            (m as any).year === yearFromPayload,
        );
        if (exact) {
          await this.tryCopyPoster(ctx, exact);
          return this.sendEpisodePage(ctx, exact, 0);
        }
        // Falls through to fuzzy as safety net
      }

      // ── Fuzzy match over all movies ──────────────────────────────────────────
      const matches: { doc: Movie; score: number }[] = [];
      for (const movie of movies) {
        const score = ratio(searchText, movie.name.toLowerCase());
        if (score >= FUZZY_MIN_SCORE) {
          matches.push({ doc: movie, score });
        }
      }
      matches.sort((a, b) => b.score - a.score);

      console.log(
        'sendMovieName matches:',
        matches.map((m) => `${m.doc.name} (${m.score})`),
      );

      if (matches.length === 0) {
        const msg = await this.replyNotFound(ctx, nameFromPayload);
        await this.saveTempMessage(msg.chat.id, msg.message_id, DEFAULT_TTL_MS);
        return;
      }

      if (matches.length === 1) {
        await this.tryCopyPoster(ctx, matches[0].doc);
        return this.sendEpisodePage(ctx, matches[0].doc, 0);
      }

      // Multiple matches → paginated picker (mpick_ callbacks)
      await this.sendMoviePickerPage(ctx, matches, 0);
    } catch (err) {
      console.error('sendMovieName error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Picker A  –  Deep-link multiple-match
  //  Callback prefix: mpick_<page>
  // ════════════════════════════════════════════

  /**
   * Renders one page of the deep-link multiple-match picker.
   * Each link encodes base64(name|year) for exact resolution on click.
   */
  private async sendMoviePickerPage(
    ctx: any,
    matches: { doc: any; score: number }[],
    page: number,
    isEdit = false,
  ) {
    const start = page * PICKER_PAGE_SIZE;
    const end = start + PICKER_PAGE_SIZE;
    const pageItems = matches.slice(start, end);
    const totalPages = Math.ceil(matches.length / PICKER_PAGE_SIZE);

    let text =
      `<b>Multiple Results Found</b>\n` +
      `<i>Please choose the exact movie</i>\n\n` +
      `🎬 <b>Movies (Page ${page + 1}/${totalPages})</b>\n\n`;

    for (let i = 0; i < pageItems.length; i++) {
      const movie = pageItems[i].doc;
      const year: number | null = (movie as any).year ?? null;
      const audio = this.extractAudio(movie) || 'Unknown';
      const qual = this.extractQuality(movie) || 'Unknown';

      const payload = year ? `${movie.name}|${year}` : movie.name;
      const enc = Buffer.from(payload, 'utf-8').toString('base64');
      const link = `https://t.me/${this.boturl}?start=${enc}`;

      text += `${start + i + 1}.┎ <b>${this.escapeHtml(movie.name)}</b> ➻ <a href="${link}">Click Here</a>\n`;
      text += `   ┃\n`;
      if (year) {
        text += `   ┠  <b>Year : <i>${year}</i></b>\n`;
        text += `   ┃\n`;
      }
      text += `   ┠  <b>Audio : <i>${this.escapeHtml(audio)}</i></b>\n`;
      text += `   ┃\n`;
      text += `   ┖ <b>Quality : <i>${this.escapeHtml(qual)}</i></b>\n\n`;
    }

    const navButtons: any[] = [];
    if (page > 0)
      navButtons.push({ text: '⬅️ Prev', callback_data: `mpick_${page - 1}` });
    navButtons.push({ text: `${page + 1} / ${totalPages}`, callback_data: 'noop' });
    if (end < matches.length)
      navButtons.push({ text: 'Next ➡️', callback_data: `mpick_${page + 1}` });

    const opts: any = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [navButtons] },
    };

    if (isEdit) {
      await ctx.editMessageText(text, opts);
    } else {
      const sent = await ctx.reply(text, opts);
      await this.saveTempMessage(sent.chat.id, sent.message_id, FILE_TTL_MS, ctx.from.id);

      const warn = await ctx.reply(
        `<b>⚠️ Warning</b>\n\n<blockquote>Due to Copyright issues, messages will be deleted after 5 minutes.\n<b>Forward the message to Saved Messages.</b></blockquote>`,
        { parse_mode: 'HTML' },
      );
      await this.saveTempMessage(warn.chat.id, warn.message_id, FILE_TTL_MS, ctx.from.id);
    }
  }

  /**
   * Handles mpick_<page> pagination callbacks (deep-link picker).
   * Recovers the search query from the visible message text, re-runs fuzzy.
   */
  private async handleMultipleMoviePicker(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data; // mpick_<page>
      const page = parseInt(data.split('_')[1], 10);

      const msgText: string = ctx.callbackQuery.message?.text || '';
      const nameLine = msgText.split('\n').find((l) => l.includes('➻'));
      if (!nameLine) {
        return ctx.answerCbQuery('⚠️ Could not recover original query.');
      }

      const rawName = nameLine
        .replace(/^\d+\.\s*[┎┖┠┃]*\s*/, '')
        .split('➻')[0]
        .trim();

      const movies = await this.movieModel.find();
      const matches = movies
        .map((doc) => ({
          doc,
          score: ratio(rawName.toLowerCase(), doc.name.toLowerCase()),
        }))
        .filter((r) => r.score >= FUZZY_MIN_SCORE)
        .sort((a, b) => b.score - a.score);

      if (matches.length === 0) {
        return ctx.answerCbQuery('⚠️ Results expired, please search again.');
      }

      await this.sendMoviePickerPage(ctx, matches, page, true);
    } catch (err) {
      console.error('handleMultipleMoviePicker error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Picker B  –  Plain-text multiple-match
  //  Callback prefix: smpick_<page>
  // ════════════════════════════════════════════

  /**
   * Renders one page of the plain-text search multiple-match picker.
   *
   * Movies and animes are merged into one flat list (movies first, then
   * animes), paginated at PICKER_PAGE_SIZE per page. Uses smpick_ callback
   * prefix to avoid collision with the deep-link picker (mpick_).
   *
   * @param isEdit  true when called from a pagination callback (edits in place).
   */
  private async sendMultipleResultsPicker(
    ctx: any,
    movieMatches: { doc: any; score: number }[],
    animeMatches: { doc: any; score: number }[],
    page: number,
    isEdit = false,
  ) {
    // Merge into one flat array: movies first, then animes
    const allItems: { doc: any; score: number; type: 'movie' | 'anime' }[] = [
      ...movieMatches.map((m) => ({ ...m, type: 'movie' as const })),
      ...animeMatches.map((a) => ({ ...a, type: 'anime' as const })),
    ];

    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / PICKER_PAGE_SIZE);
    const start = page * PICKER_PAGE_SIZE;
    const end = start + PICKER_PAGE_SIZE;
    const pageItems = allItems.slice(start, end);

    let text =
      `<b>Multiple Results Found</b>\n` +
      `<i>Please choose the exact Movie or Anime</i>\n\n` +
      `📋 <b>Results (Page ${page + 1}/${totalPages})</b>\n\n`;

    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const globalIdx = start + i + 1;
      const year: number | null = (item.doc as any).year ?? null;
      const audio = this.extractAudio(item.doc) || 'Unknown';
      const qual = this.extractQuality(item.doc) || 'Unknown';

      if (item.type === 'movie') {
        const payload = year ? `${item.doc.name}|${year}` : item.doc.name;
        const enc = Buffer.from(payload, 'utf-8').toString('base64');
        const link = `https://t.me/${this.boturl}?start=${enc}`;
        text += `${globalIdx}.🎬 ┎ <b>${this.escapeHtml(item.doc.name)}</b> ➻ <a href="${link}">Click Here</a>\n`;
      } else {
        const enc = Buffer.from(item.doc.name, 'utf-8').toString('base64');
        const link = `https://t.me/${this.animeboturl}?start=${enc}`;
        text += `${globalIdx}.🎌 ┎ <b>${this.escapeHtml(item.doc.name)}</b> ➻ <a href="${link}">Click Here</a>\n`;
      }

      text += `   ┃\n`;
      if (year) {
        text += `   ┠  <b>Year : <i>${year}</i></b>\n`;
        text += `   ┃\n`;
      }
      text += `   ┠  <b>Audio : <i>${this.escapeHtml(audio)}</i></b>\n`;
      text += `   ┃\n`;
      text += `   ┖ <b>Quality : <i>${this.escapeHtml(qual)}</i></b>\n\n`;
    }

    // ── Navigation row (smpick_ prefix) ──────────────────────────────────────
    const navButtons: any[] = [];
    if (page > 0)
      navButtons.push({ text: '⬅️ Prev', callback_data: `smpick_${page - 1}` });
    navButtons.push({ text: `${page + 1} / ${totalPages}`, callback_data: 'noop' });
    if (end < totalItems)
      navButtons.push({ text: 'Next ➡️', callback_data: `smpick_${page + 1}` });

    const opts: any = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [navButtons] },
    };

    if (isEdit) {
      await ctx.editMessageText(text, opts);
    } else {
      const sent = await ctx.reply(text, {
        ...opts,
        reply_to_message_id: ctx.message?.message_id,
      });
      await this.saveTempMessage(sent.chat.id, sent.message_id, FILE_TTL_MS, ctx.from.id);

      const warn = await ctx.reply(
        `<b>⚠️ Warning</b>\n\n<blockquote>Due to Copyright issues, messages will be deleted after 5 minutes.\n<b>Forward the message to Saved Messages.</b></blockquote>`,
        {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message?.message_id,
        },
      );
      await this.saveTempMessage(warn.chat.id, warn.message_id, FILE_TTL_MS, ctx.from.id);
    }
  }

  /**
   * Handles smpick_<page> pagination callbacks (plain-text picker).
   *
   * Recovers the original query from the first "➻" line in the message,
   * re-runs both movie and anime fuzzy searches to rebuild the combined
   * list, then renders the requested page in-place.
   */
  private async handleSendMultiplePicker(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data; // smpick_<page>
      const page = parseInt(data.split('_')[1], 10);

      // Recover query from the first "➻" line in the visible message
      const msgText: string = ctx.callbackQuery.message?.text || '';
      const nameLine = msgText.split('\n').find((l) => l.includes('➻'));
      if (!nameLine) {
        return ctx.answerCbQuery('⚠️ Could not recover original query.');
      }

      // Strip leading number, type emoji, and box-drawing chars → clean title
      const rawName = nameLine
        .replace(/^\d+\.[🎬🎌]?\s*[┎┖┠┃]*\s*/, '')
        .split('➻')[0]
        .trim();

      // Re-run fuzzy for both movies and animes in parallel
      const [movies, animes] = await Promise.all([
        this.movieModel.find(),
        this.animeModel.find(),
      ]);

      const movieMatches = movies
        .map((doc) => ({
          doc,
          score: ratio(rawName.toLowerCase(), doc.name.toLowerCase()),
        }))
        .filter((r) => r.score >= FUZZY_MIN_SCORE)
        .sort((a, b) => b.score - a.score);

      const animeMatches = animes
        .map((doc) => ({
          doc,
          score: ratio(rawName.toLowerCase(), doc.name.toLowerCase()),
        }))
        .filter((r) => r.score >= FUZZY_MIN_SCORE)
        .sort((a, b) => b.score - a.score);

      if (movieMatches.length === 0 && animeMatches.length === 0) {
        return ctx.answerCbQuery('⚠️ Results expired, please search again.');
      }

      await this.sendMultipleResultsPicker(ctx, movieMatches, animeMatches, page, true);
    } catch (err) {
      console.error('handleSendMultiplePicker error:', err.message);
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

      if (page === 0) {
        buttons.push([
          { text: '📥 Send All', callback_data: `all_${movie._id}` },
        ]);
      }

      files.forEach((file: any, idx: number) => {
        const label = file.fileName
          .replace(/^@\S+\s*[:-]*\s*/, '')
          .replace(/\.mkv$/i, '');
        const size = file.size || '';
        const originalIndex = movie.files.length - 1 - (start + idx);
        buttons.push([
          {
            text: `[${size}] - ${label}`,
            callback_data: `file_${movie._id}_${originalIndex}`,
          },
        ]);
      });

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
        const parts = data.split('_');
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
        const parts = data.split('_');
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
      await this.saveTempMessage(ctx.chat.id, msg.message_id, DEFAULT_TTL_MS, ctx.from.id);
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
      await this.saveTempMessage(ctx.chat.id, msg.message_id, DEFAULT_TTL_MS, ctx.from.id);
    } catch (err) {
      console.error('backToStart error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Admin commands  (owner-only)
  // ════════════════════════════════════════════

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

  async requestedMovies(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const requests = await this.requestModel.find();
      if (!requests.length)
        return ctx.reply('⚠️ No Requested Movies Found', { parse_mode: 'HTML' });

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

  async deleteRequestedMovies(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply('⚠️ Please provide a movie name.\nEg: /drm <movieName>', {
          parse_mode: 'HTML',
        });
      await this.requestModel.deleteMany({ name: input });
      await ctx.reply('✅ Requested Movie Deleted Successfully', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('deleteRequestedMovies error:', err);
    }
  }

  async searchMovie(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply('⚠️ Please provide a movie name.\nEg: /sm <movieName>', {
          parse_mode: 'HTML',
        });

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

  async deleteMovieInDB(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply('⚠️ Please provide a movie name.\nEg: /dm <movieName>', {
          parse_mode: 'HTML',
        });
      await this.movieModel.deleteOne({ name: input });
      await ctx.reply('✅ Movie Deleted Successfully', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('deleteMovieInDB error:', err);
    }
  }

  // ════════════════════════════════════════════
  //  Broadcast helper
  // ════════════════════════════════════════════

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

  private async tryCopyPoster(ctx: any, doc: any) {
    if (doc.poster?.chatId && doc.poster?.messageId) {
      const posterMsg = await ctx.telegram.copyMessage(
        ctx.chat.id,
        doc.poster.chatId,
        doc.poster.messageId,
      );
      await this.saveTempMessage(ctx.chat.id, posterMsg.message_id, FILE_TTL_MS);
    }
  }

  private async sendAllFiles(ctx: any, files: any[], name: string) {
    for (const file of files) {
      const message = await ctx.telegram.copyMessage(
        ctx.chat.id,
        file.chatId,
        file.messageId,
      );
      await this.saveTempMessage(ctx.chat.id, message.message_id, FILE_TTL_MS, ctx.from.id);
    }
    await this.replyFilesSent(ctx, name);
  }

  private async sendSingleFile(ctx: any, file: any, name: string) {
    const message = await ctx.telegram.copyMessage(
      ctx.chat.id,
      file.chatId,
      file.messageId,
    );
    await this.saveTempMessage(ctx.chat.id, message.message_id, FILE_TTL_MS, ctx.from.id);
    await this.replyFilesSent(ctx, name);
  }

  private async replyFilesSent(ctx: any, name: string) {
    const successMsg = await ctx.reply(
      `✅ <b>"${name}" sent successfully!</b>\n\n` +
        `🍿 Enjoy watching.\n\n` +
        `<b>⏳ Files will be deleted after 5 mins.</b>\n\n` +
        `<b>Please forward to Saved Messages or your friends.</b>`,
      { parse_mode: 'HTML' },
    );
    await this.saveTempMessage(ctx.chat.id, successMsg.message_id, FILE_TTL_MS, ctx.from.id);
  }

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
      await this.saveTempMessage(ctx.chat.id, msg.message_id, FILE_TTL_MS, ctx.from.id);
    }
  }

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