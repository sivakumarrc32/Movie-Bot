/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose'
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
import { SettingsService } from '../settings/settings.service';

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
    private settingsService: SettingsService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
    this.ownerId = this.settingsService.ownerId;
  }

  // ─────────────────────────────────────────────
  //  Live Configuration Getters (from SettingsService)
  // ─────────────────────────────────────────────

  public get requiredChannels(): ChannelInfo[] {
    return this.settingsService.movieForceSubChannels;
  }

  public get pageSize(): number {
    return this.settingsService.filesPerPage;
  }

  public get listPageSize(): number {
    return this.settingsService.listPageSize;
  }

  public get pickerPageSize(): number {
    return this.settingsService.pickerPageSize;
  }

  public get defaultTtlMs(): number {
    return this.settingsService.defaultTtlMs;
  }

  public get fileTtlMs(): number {
    return this.settingsService.fileTtlMs;
  }

  public get fuzzyMinScore(): number {
    return this.settingsService.fuzzyMinScore;
  }

  public get startGifId(): string {
    return this.settingsService.movieStartGifId;
  }

  public get supportGroupUrl(): string {
    return this.settingsService.supportGroupUrl;
  }

  public get developerUrl(): string {
    return this.settingsService.developerUrl;
  }

  public get promoChannelUrl(): string {
    return this.settingsService.promoChannelUrl;
  }

  public get movieBotUsername(): string {
    return this.settingsService.movieBotUsername;
  }

  public get animeBotUsername(): string {
    return this.settingsService.animeBotUsername;
  }

  // ════════════════════════════════════════════
  //  Lifecycle
  // ════════════════════════════════════════════

  async onModuleInit() {
    await this.loadBotUrls();
    this.registerHandlers();

    const isPolling = this.configService.get('BOT_MODE') === 'polling';
    if (isPolling) {
      try {
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
        this.bot.launch(() => {
          console.log('🚀 [Dev Mode] Movie Bot started in Long Polling mode');
        });
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
      } catch (err: any) {
        console.error('Failed to launch Movie Bot polling:', err.message);
      }
    } else {
      console.log('🌐 [Prod Mode] Movie Bot Webhook mode active');
    }
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
    this.bot.command('settings', (ctx) => this.settingsService.renderMainDashboard(ctx));
    this.bot.command('cancel', (ctx) => this.settingsService.handleAdminInput(ctx));

    // ── Inline-keyboard actions ───────────────
    this.bot.action(/^sett_/, (ctx) => this.settingsService.handleCallbackQuery(ctx));
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
    this.bot.action(/^(all|file|page|qfilter|tab)_/, (ctx) =>
      this.handleEpisodeSelection(ctx),
    );
    this.bot.action(
      /^(anime_all|anime_file|anime_page|anime_qfilter|anime_tab)_/,
      (ctx) => this.handleAnimeEpisodeSelection(ctx),
    );

    // Admin Delete Movie Action
    this.bot.action(/^dm_/, (ctx) => this.handleDeleteMovieCallback(ctx));

    // ── Plain text → search ───────────────────
    this.bot.on('text', (ctx) => this.sendMovie(ctx));
    this.bot.on(['photo', 'animation', 'document', 'sticker'], (ctx) =>
      this.settingsService.handleAdminInput(ctx),
    );
  }

  // ════════════════════════════════════════════
  //  Auth helpers
  // ════════════════════════════════════════════

  /** Returns true only if the sender is the bot owner */
  private checkOwner(ctx: any): boolean {
    if (!this.settingsService.isOwner(ctx.from?.id)) {
      ctx.reply(
        `<b>🚫 You are not authorized to use this bot.</b>\n\n\n @${this.movieBotUsername} Here You Can Get the Movies`,
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

      for (const channel of this.requiredChannels) {
        try {
          const member = await ctx.telegram.getChatMember(
            channel.id,
            ctx.from.id,
          );
          if (member.status === 'left' || member.status === 'kicked') {
            notJoined.push(channel);
          }
        } catch (err: any) {
          console.error(
            `⚠️ [MovieBot checkSubscription] Error for channel "${channel.text}" (ID: ${channel.id}): ${err.message}. Ensure your test bot is added as an ADMIN to this channel!`,
          );
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

      const subCaption =
        `Hi ${ctx.from.first_name},\n\n` +
        `<b>Innum sila channel la join pannanum</b>\n\n` +
        `Movies & updates miss aagama irukka\n` +
        `👇 keela irukkura channel la join pannunga`;

      let sentSubMsg = false;
      if (this.startGifId) {
        try {
          await ctx.replyWithAnimation(this.startGifId, {
            caption: subCaption,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
          sentSubMsg = true;
        } catch (animErr: any) {
          console.warn('Could not send startGif in checkSubscription, falling back to text:', animErr.message);
        }
      }

      if (!sentSubMsg) {
        await ctx.reply(subCaption, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
      }
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
      const startCaption =
        `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a>\n\n` +
        `<i>I'm your friendly Movie Bot 🤖</i>\n\n` +
        `<b>Here, you can get movie files directly</b> — no link shorteners, no ads, just pure movies! 🍿\n\n` +
        `👉 <b>Send the correct movie name</b>, and if it's available in my database, you'll get the <b>file instantly!</b>\n\n` +
        `⚡<i>Enjoy your movie time! 🎥💫</i>`;

      const startMarkup = {
        inline_keyboard: [
          [
            {
              text: 'Movie Bot',
              url: `https://t.me/${this.movieBotUsername}`,
            },
            {
              text: 'Anime Bot',
              url: `https://t.me/${this.animeBotUsername}`,
            },
          ],
          [
            { text: '📃 List of Movies', callback_data: 'list' },
            { text: 'ℹ️ Help', callback_data: 'help' },
          ],
          [
            { text: '👨‍💻 About Bot', callback_data: 'about' },
            { text: '⚙️ Support', url: this.supportGroupUrl },
          ],
          [{ text: 'Developer', url: this.developerUrl }],
        ],
      };

      let msg: any;
      if (this.startGifId) {
        try {
          msg = await ctx.replyWithAnimation(this.startGifId, {
            caption: startCaption,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: startMarkup,
          });
        } catch (animErr: any) {
          console.warn('Could not send startGif, falling back to text:', animErr.message);
        }
      }

      if (!msg) {
        msg = await ctx.reply(startCaption, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: startMarkup,
        });
      }

      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        this.defaultTtlMs,
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
        this.defaultTtlMs,
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
      const skip = (page - 1) * this.listPageSize;
      const totalMovies = await this.movieModel.countDocuments();
      const totalPages = Math.ceil(totalMovies / this.listPageSize);
      const movies = await this.movieModel
        .find({}, 'name')
        .skip(skip)
        .limit(this.listPageSize);

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
      // Bug #15 Fixed: Unified page label format to "Page X/Y" (was "Pages: X/Y" here
      // vs "Pages X/Y" in episode nav vs "X / Y" in pickers — now consistent).
      navButtons.push({
        text: `Page ${page}/${totalPages}`,
        callback_data: 'noop',
      });
      if (skip + this.listPageSize < totalMovies)
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
    if (ctx.message?.text?.startsWith('/')) {
      if (ctx.message.text === '/cancel') {
        const handled = await this.settingsService.handleAdminInput(ctx);
        if (handled) return;
      }
      return;
    }

    // Check if admin is currently in a /settings editing session
    const handledBySettings = await this.settingsService.handleAdminInput(ctx);
    if (handledBySettings) return;

    const isJoined = await this.checkSubscription(ctx);
    if (!isJoined) return;

    const senderName = [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(' ');
    const username = ctx.from.username ? `@${ctx.from.username}` : '(no username)';
    console.log(`🎬 Movie Query received from ${senderName} [${username}] (ID: ${ctx.from.id})`);

    // ✅ Enable direct search in PM for Admin / Owner
    if (this.settingsService.isOwner(ctx.from?.id)) {
      const text = ctx.message?.text?.trim();
      if (text) {
        return this.sendMovieName(ctx, text);
      }
    }

    try {
      const searchGroupUrl = this.settingsService.searchGroupUrl;
      const searchGroupText = this.settingsService.searchGroupText;

      const msg = await ctx.reply(
        `👋 <i>Hi ${ctx.from.first_name || 'there'}</i>,\n\n` +
          `🚫 <b>Direct Search is disabled in this Bot!</b>\n\n` +
          `👉 <b>Movies & Series search panna keela irukkura Group-la join pannunga:</b>\n` +
          `Group-la movie name send panna bot ungalukku direct-ah files anupidum. 🍿`,
        {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message?.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: `👥 ${searchGroupText}`, url: searchGroupUrl }],
            ],
          },
        },
      );
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        this.defaultTtlMs,
        ctx.from.id,
      );
    } catch (err: any) {
      console.error('sendMovie error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Deep-link entry  –  /start with payload
  // ════════════════════════════════════════════

  /**
   * Called when the bot is opened via a deep-link (/start <payload>).
   */
  async sendMovieName(ctx: any, name: string) {
    try {
      // ── Format 0: Direct single file payload (file:<movieId>:<fileIndex> or file_<movieId>_<fileIndex>) ──
      if (name.startsWith('file:') || name.startsWith('file_')) {
        const separator = name.startsWith('file:') ? ':' : '_';
        const parts = name.split(separator);
        const movieId = parts[1];
        const idx = parseInt(parts[2], 10);
        let movie: any = await this.movieModel.findById(movieId);
        if (!movie) {
          movie = await this.animeModel.findById(movieId);
        }
        if (movie && movie.files && movie.files[idx]) {
          await this.sendSingleFile(ctx, movie.files[idx], movie.name);
          return;
        }
        if (movie) {
          await this.tryCopyPoster(ctx, movie);
          return this.sendEpisodePage(ctx, movie, 0);
        }
        const msg = await this.replyNotFound(ctx, movieId);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Format 0.2: Direct episode payload (epi:<movieId>:<epKey> or epi_<movieId>_<epKey>) ──
      if (name.startsWith('epi:') || name.startsWith('epi_')) {
        const separator = name.startsWith('epi:') ? ':' : '_';
        const parts = name.split(separator);
        const movieId = parts[1];
        const epKey = parts.slice(2).join(separator);
        let movie: any = await this.movieModel.findById(movieId);
        if (!movie) {
          movie = await this.animeModel.findById(movieId);
        }
        if (movie && movie.files && movie.files.length > 0) {
          const normKey = normalizeEpisodeNumber(epKey);
          const matchingFiles: { file: any; originalIndex: number }[] = [];
          movie.files.forEach((file: any, idx: number) => {
            const ep = file.episode || extractEpisode('', file.fileName);
            if (normalizeEpisodeNumber(ep) === normKey) {
              matchingFiles.push({ file, originalIndex: idx });
            }
          });

          if (matchingFiles.length === 1) {
            await this.sendSingleFile(ctx, matchingFiles[0].file, movie.name);
            return;
          } else if (matchingFiles.length > 1) {
            matchingFiles.sort((a, b) => {
              const resA =
                a.file.quality || extractResolution('', a.file.fileName) || '';
              const resB =
                b.file.quality || extractResolution('', b.file.fileName) || '';
              const weightA = getQualityWeight(resA);
              const weightB = getQualityWeight(resB);
              if (weightA > 0 && weightB > 0 && weightA !== weightB) {
                return weightA - weightB; // Ascending: 480p -> 720p -> 1080p
              }
              const sizeA = parseFloat(a.file.size) || 0;
              const sizeB = parseFloat(b.file.size) || 0;
              return sizeA - sizeB;
            });

            await this.tryCopyPoster(ctx, movie);

            const buttons: any[] = [];
            matchingFiles.forEach(({ file, originalIndex }) => {
              const ep = file.episode || extractEpisode('', file.fileName) || normKey;
              const epToken = ep ? normalizeEpisodeNumber(ep) : 'E01';
              const res =
                file.quality ||
                extractResolution('', file.fileName) ||
                'HD';
              const size = file.size || '';
              const fn = cleanFileName(file.fileName || '');

              const btnText = formatButtonLabel([epToken, res, size, fn]);
              buttons.push([
                {
                  text: btnText,
                  callback_data: `file_${movie._id}_${originalIndex}`,
                },
              ]);
            });

            const epDisplay = formatEpisodeDisplayName(normKey);
            const caption = `🎬 <b>${this.escapeHtml(movie.name)}</b>\n📍 <b>${epDisplay}</b> — <i>Select Quality:</i>`;
            const msg = await ctx.reply(caption, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons },
            });
            await this.saveTempMessage(
              msg.chat.id,
              msg.message_id,
              this.defaultTtlMs,
              ctx.from.id,
            );
            return;
          } else {
            await this.tryCopyPoster(ctx, movie);
            return this.sendEpisodePage(ctx, movie, 0);
          }
        }
        if (movie) {
          await this.tryCopyPoster(ctx, movie);
          return this.sendEpisodePage(ctx, movie, 0);
        }
        const msg = await this.replyNotFound(ctx, name);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Format 0.3: Direct quality payload (qual:<movieId>:<quality> or qual_<movieId>_<quality>) ──
      if (name.startsWith('qual:') || name.startsWith('qual_')) {
        const separator = name.startsWith('qual:') ? ':' : '_';
        const parts = name.split(separator);
        const movieId = parts[1];
        const targetQual = parts.slice(2).join(separator).toLowerCase().trim();
        let movie: any = await this.movieModel.findById(movieId);
        if (!movie) {
          movie = await this.animeModel.findById(movieId);
        }
        if (movie && movie.files && movie.files.length > 0) {
          const matchingFiles: { file: any; originalIndex: number }[] = [];
          movie.files.forEach((file: any, idx: number) => {
            const res = (
              file.quality ||
              extractResolution('', file.fileName) ||
              ''
            )
              .toLowerCase()
              .trim();
            if (
              res === targetQual ||
              res.includes(targetQual) ||
              targetQual.includes(res)
            ) {
              matchingFiles.push({ file, originalIndex: idx });
            }
          });

          if (matchingFiles.length === 1) {
            await this.sendSingleFile(ctx, matchingFiles[0].file, movie.name);
            return;
          } else if (matchingFiles.length > 1) {
            matchingFiles.sort((a, b) => {
              const sizeA = parseFloat(a.file.size) || 0;
              const sizeB = parseFloat(b.file.size) || 0;
              return sizeA - sizeB;
            });

            await this.tryCopyPoster(ctx, movie);

            const isSeriesDoc = isSeriesDocHelper(movie);
            const buttons: any[] = [];
            matchingFiles.forEach(({ file, originalIndex }) => {
              const res =
                file.quality ||
                extractResolution('', file.fileName) ||
                'HD';
              const size = file.size || '';
              const fn = cleanFileName(file.fileName || '');

              let btnText: string;
              if (isSeriesDoc) {
                const ep = file.episode || extractEpisode('', file.fileName);
                const epToken = ep ? normalizeEpisodeNumber(ep) : 'E01';
                btnText = formatButtonLabel([epToken, res, size, fn]);
              } else {
                btnText = formatButtonLabel([res, size, fn]);
              }

              buttons.push([
                {
                  text: btnText,
                  callback_data: `file_${movie._id}_${originalIndex}`,
                },
              ]);
            });

            const caption = `🎬 <b>${this.escapeHtml(movie.name)}</b>\n📍 <b>${targetQual.toUpperCase()}</b> — <i>Select File:</i>`;
            const msg = await ctx.reply(caption, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons },
            });
            await this.saveTempMessage(
              msg.chat.id,
              msg.message_id,
              this.defaultTtlMs,
              ctx.from.id,
            );
            return;
          } else {
            await this.tryCopyPoster(ctx, movie);
            return this.sendEpisodePage(ctx, movie, 0);
          }
        }
        if (movie) {
          await this.tryCopyPoster(ctx, movie);
          return this.sendEpisodePage(ctx, movie, 0);
        }
        const msg = await this.replyNotFound(ctx, movieId);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Format 0.4: Direct tab payload (tab:<movieId>:<tabName>:<quality> or tab_<movieId>_<tabName>_<quality>) ──
      if (name.startsWith('tab:') || name.startsWith('tab_')) {
        const separator = name.startsWith('tab:') ? ':' : '_';
        const parts = name.split(separator);
        const movieId = parts[1];
        const tabName = parts[2] || 'all';
        const qual = parts[3] || 'all';
        let movie: any = await this.movieModel.findById(movieId);
        if (!movie) {
          movie = await this.animeModel.findById(movieId);
        }
        if (movie && movie.files && movie.files.length > 0) {
          await this.tryCopyPoster(ctx, movie);
          return this.sendEpisodePage(ctx, movie, 0, tabName, qual);
        }
        const msg = await this.replyNotFound(ctx, movieId);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Format 0.5: Direct all files / Episode page payload (all:<movieId> or all_<movieId>) ──
      if (name.startsWith('all:') || name.startsWith('all_')) {
        const separator = name.startsWith('all:') ? ':' : '_';
        const movieId = name.split(separator)[1];
        let movie: any = await this.movieModel.findById(movieId);
        if (!movie) {
          movie = await this.animeModel.findById(movieId);
        }
        if (movie && movie.files && movie.files.length > 0) {
          await this.tryCopyPoster(ctx, movie);
          return this.sendEpisodePage(ctx, movie, 0);
        }
        const msg = await this.replyNotFound(ctx, movieId);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Format 1: id-based payload (from picker links) ───────────────────────
      if (name.startsWith('id:') || name.startsWith('id_')) {
        const docId = name.slice(3).trim();
        const movie = await this.movieModel.findById(docId);
        if (movie) {
          await this.tryCopyPoster(ctx, movie);
          return this.sendEpisodePage(ctx, movie, 0);
        }
        const msg = await this.replyNotFound(ctx, docId);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Parse legacy payload formats ─────────────────────────────────────────
      const pipeIdx = name.lastIndexOf('|');
      const yearFromPayload =
        pipeIdx !== -1 ? parseInt(name.slice(pipeIdx + 1), 10) : null;
      const nameFromPayload = pipeIdx !== -1 ? name.slice(0, pipeIdx) : name;

      const searchText = nameFromPayload.trim().toLowerCase();
      console.log('sendMovieName:', searchText, 'year:', yearFromPayload);

      // ── Format 3: exact lookup when name|year payload ────────────────────────
      if (yearFromPayload) {
        const exact = await this.movieModel.findOne({
          name: {
            $regex: `^${this.escapeRegex(nameFromPayload)}$`,
            $options: 'i',
          },
          year: yearFromPayload,
        });
        if (exact) {
          await this.tryCopyPoster(ctx, exact);
          return this.sendEpisodePage(ctx, exact, 0);
        }
      }

      const candidates = await this.movieModel.find({
        name: { $regex: this.escapeRegex(nameFromPayload), $options: 'i' },
      });

      if (candidates.length === 0) {
        const msg = await this.replyNotFound(ctx, nameFromPayload);
        await this.saveTempMessage(
          msg.chat.id,
          msg.message_id,
          this.defaultTtlMs,
          ctx.from.id,
        );
        return;
      }

      // ── Fuzzy match over the regex-filtered candidates ────────────────────────
      const matches: { doc: Movie; score: number }[] = [];
      for (const movie of candidates) {
        const score = ratio(searchText, movie.name.toLowerCase());
        if (score >= this.fuzzyMinScore) {
          matches.push({ doc: movie, score });
        }
      }
      matches.sort((a, b) => b.score - a.score);

      const finalMatches =
        matches.length > 0
          ? matches
          : candidates.map((doc) => ({ doc, score: 0 }));

      if (finalMatches.length === 1) {
        await this.tryCopyPoster(ctx, finalMatches[0].doc);
        return this.sendEpisodePage(ctx, finalMatches[0].doc, 0);
      }

      // Multiple matches → paginated picker (mpick_ callbacks)
      await this.sendMoviePickerPage(ctx, finalMatches, 0);
    } catch (err) {
      console.error('sendMovieName error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Picker A  –  Deep-link multiple-match
  //  Callback prefix: mpick_<page>
  // ════════════════════════════════════════════

  private async sendMoviePickerPage(
    ctx: any,
    matches: { doc: any; score: number }[],
    page: number,
    isEdit = false,
  ) {
    const start = page * this.pickerPageSize;
    const end = start + this.pickerPageSize;
    const pageItems = matches.slice(start, end);
    const totalPages = Math.ceil(matches.length / this.pickerPageSize);

    let text =
      `<b>Multiple Results Found</b>\n` +
      `<i>Please choose the exact movie</i>\n\n` +
      `🎬 <b>Movies (Page ${page + 1}/${totalPages})</b>\n\n`;

    for (let i = 0; i < pageItems.length; i++) {
      const movie = pageItems[i].doc;
      const year: number | null = (movie as any).year ?? null;
      const audio = this.extractAudio(movie) || 'Unknown';
      const qual = this.extractQuality(movie) || 'Unknown';

      const enc = Buffer.from(`id:${movie._id}`, 'utf-8').toString('base64');
      const link = `https://t.me/${this.movieBotUsername}?start=${enc}`;

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
    navButtons.push({
      text: `Page ${page + 1}/${totalPages}`,
      callback_data: 'noop',
    });
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
      await this.saveTempMessage(
        sent.chat.id,
        sent.message_id,
        this.fileTtlMs,
        ctx.from.id,
      );

      const warn = await ctx.reply(
        `<b>⚠️ Warning</b>\n\n<blockquote>Due to Copyright issues, messages will be deleted after 5 minutes.\n<b>Forward the message to Saved Messages.</b></blockquote>`,
        { parse_mode: 'HTML' },
      );
      await this.saveTempMessage(
        warn.chat.id,
        warn.message_id,
        this.fileTtlMs,
        ctx.from.id,
      );
    }
  }

  private async handleMultipleMoviePicker(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data; // mpick_<page>
      const page = parseInt(data.split('_')[1], 10);

      const msgText: string = ctx.callbackQuery.message?.text || '';
      const headerLine = msgText.split('\n').find((l) => l.startsWith('🔍'));
      if (!headerLine) {
        return ctx.answerCbQuery(
          '⚠️ Could not recover original query. Please search again.',
        );
      }

      const searchName = headerLine.replace(/^🔍\s*/, '').trim();
      if (!searchName) {
        return ctx.answerCbQuery(
          '⚠️ Could not recover original query. Please search again.',
        );
      }

      const candidates = await this.movieModel.find({
        name: { $regex: this.escapeRegex(searchName), $options: 'i' },
      });

      let matches = candidates
        .map((doc) => ({
          doc,
          score: ratio(searchName.toLowerCase(), doc.name.toLowerCase()),
        }))
        .filter((r) => r.score >= this.fuzzyMinScore)
        .sort((a, b) => b.score - a.score);

      if (matches.length === 0 && candidates.length > 0) {
        matches = candidates.map((doc) => ({ doc, score: 0 }));
      }

      if (matches.length === 0) {
        return ctx.answerCbQuery('⚠️ Results expired, please search again.');
      }

      await this.sendMoviePickerPage(ctx, matches, page, true);
    } catch (err) {
      console.error('handleMultipleMoviePicker error:', err.message);
    }
  }

  private async handleSendMultiplePicker(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data; // smpick_<page>
      const page = parseInt(data.split('_')[1], 10);

      const msgText: string = ctx.callbackQuery.message?.text || '';
      const headerLine = msgText.split('\n').find((l) => l.startsWith('🔍'));
      if (!headerLine) {
        return ctx.answerCbQuery(
          '⚠️ Could not recover original query. Please search again.',
        );
      }

      const searchName = headerLine.replace(/^🔍\s*/, '').trim();
      if (!searchName) {
        return ctx.answerCbQuery(
          '⚠️ Could not recover original query. Please search again.',
        );
      }

      const movieCandidates = await this.movieModel.find({
        name: { $regex: this.escapeRegex(searchName), $options: 'i' },
      });
      const animeCandidates = await this.animeModel.find({
        name: { $regex: this.escapeRegex(searchName), $options: 'i' },
      });

      const movieMatches = this.findTopMatches(searchName, movieCandidates);
      const animeMatches = this.findTopMatches(searchName, animeCandidates);

      if (movieMatches.length === 0 && animeMatches.length === 0) {
        return ctx.answerCbQuery('⚠️ Results expired, please search again.');
      }

      await this.sendMultipleResultsPicker(
        ctx,
        movieMatches,
        animeMatches,
        page,
        searchName,
        true,
      );
    } catch (err: any) {
      console.error('handleSendMultiplePicker error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Picker B  –  Plain-text multiple-match
  //  Callback prefix: smpick_<page>
  // ════════════════════════════════════════════

  private async sendMultipleResultsPicker(
    ctx: any,
    movieMatches: { doc: any; score: number }[],
    animeMatches: { doc: any; score: number }[],
    page: number,
    searchName: string,
    isEdit = false,
  ) {
    const allItems: { doc: any; score: number; type: 'movie' | 'anime' }[] = [
      ...movieMatches.map((m) => ({ ...m, type: 'movie' as const })),
      ...animeMatches.map((a) => ({ ...a, type: 'anime' as const })),
    ];

    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / this.pickerPageSize);
    const start = page * this.pickerPageSize;
    const end = start + this.pickerPageSize;
    const pageItems = allItems.slice(start, end);

    let text =
      `<b>Multiple Results Found</b>\n` +
      `<i>Please choose the exact Movie or Anime</i>\n\n` +
      `🔍 ${this.escapeHtml(searchName)}\n` +
      `📋 <b>Results (Page ${page + 1}/${totalPages})</b>\n\n`;

    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const globalIdx = start + i + 1;
      const year: number | null = item.doc.year ?? null;
      const audio = this.extractAudio(item.doc) || 'Unknown';
      const qual = this.extractQuality(item.doc) || 'Unknown';

      if (item.type === 'movie') {
        const enc = Buffer.from(`id:${item.doc._id}`, 'utf-8').toString(
          'base64',
        );
        const link = `https://t.me/${this.movieBotUsername}?start=${enc}`;
        text += `${globalIdx}.🎬 ┎ <b>${this.escapeHtml(item.doc.name)}</b> ➻ <a href="${link}">Click Here</a>\n`;
      } else {
        const enc = Buffer.from(item.doc.name, 'utf-8').toString('base64');
        const link = `https://t.me/${this.animeBotUsername}?start=${enc}`;
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
    // Bug #15 Fixed: Unified page label to "Page X/Y".
    navButtons.push({
      text: `Page ${page + 1}/${totalPages}`,
      callback_data: 'noop',
    });
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
      const msg = await ctx.reply(text, opts);
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        this.defaultTtlMs,
        ctx.from.id,
      );
    }
  }

  // ════════════════════════════════════════════
  //  Episode page  –  Movie
  // ════════════════════════════════════════════

  private async sendEpisodePage(
    ctx: any,
    movie: any,
    page: number = 0,
    selectedTab: string = 'all',
    selectedQuality: string = 'all',
  ) {
    try {
      // 1. Detect if single batch packs and/or separate episodes exist
      const hasSinglePacks = movie.files.some((f: any) => {
        const ep = f.episode || extractEpisode('', f.fileName);
        return isEpisodeRange(ep) || isEpisodeRange(f.fileName);
      });
      const hasSeparateEpisodes = movie.files.some((f: any) => {
        const ep = f.episode || extractEpisode('', f.fileName);
        return !(isEpisodeRange(ep) || isEpisodeRange(f.fileName));
      });

      const activeTab = (selectedTab || 'all').toLowerCase().trim();

      // 2. Filter files based on Category Tab (all | single | sep)
      let tabFilteredItems = movie.files.map(
        (file: any, originalIndex: number) => ({
          file,
          originalIndex,
        }),
      );

      if (activeTab === 'single') {
        tabFilteredItems = tabFilteredItems.filter((item) => {
          const ep =
            item.file.episode || extractEpisode('', item.file.fileName);
          return isEpisodeRange(ep) || isEpisodeRange(item.file.fileName);
        });
      } else if (activeTab === 'sep') {
        tabFilteredItems = tabFilteredItems.filter((item) => {
          const ep =
            item.file.episode || extractEpisode('', item.file.fileName);
          return !(isEpisodeRange(ep) || isEpisodeRange(item.file.fileName));
        });
      }

      // 3. Extract distinct qualities from the tab-filtered files
      const qualSet = new Set<string>();
      const distinctQualities: string[] = [];
      tabFilteredItems.forEach((it) => {
        const q = (
          it.file.quality ||
          extractResolution('', it.file.fileName) ||
          ''
        ).trim();
        if (q && !qualSet.has(q.toLowerCase())) {
          qualSet.add(q.toLowerCase());
          distinctQualities.push(q);
        }
      });
      distinctQualities.sort(
        (a, b) => getQualityWeight(a) - getQualityWeight(b),
      );

      // 4. Filter by quality if activeQual !== 'all'
      const activeQual = (selectedQuality || 'all').toLowerCase().trim();
      let filteredItems = tabFilteredItems;
      if (activeQual !== 'all') {
        filteredItems = filteredItems.filter((item) => {
          const res = (
            item.file.quality ||
            extractResolution('', item.file.fileName) ||
            ''
          )
            .toLowerCase()
            .trim();
          return (
            res === activeQual ||
            res.includes(activeQual) ||
            activeQual.includes(res)
          );
        });
      }

      // 5. Reverse so latest episodes appear first
      const reversedFiles = [...filteredItems].reverse();
      const totalFiles = reversedFiles.length;
      const totalPages = Math.max(1, Math.ceil(totalFiles / this.pageSize));
      const validPage = Math.min(Math.max(0, page), totalPages - 1);
      const start = validPage * this.pageSize;
      const end = start + this.pageSize;
      const pageFiles = reversedFiles.slice(start, end);

      const buttons: any[] = [];

      // Row 1: Mode Tabs [ All | Single Files | Separate ] (if both single packs and separate episodes exist)
      if (hasSinglePacks && hasSeparateEpisodes) {
        const tabRow: any[] = [];
        tabRow.push({
          text: activeTab === 'all' ? '✅ All' : '🌟 All',
          callback_data: `tab_${movie._id}_all`,
        });
        tabRow.push({
          text: activeTab === 'single' ? '✅ Single Files' : '📁 Single Files',
          callback_data: `tab_${movie._id}_single`,
        });
        tabRow.push({
          text: activeTab === 'sep' ? '✅ Separate' : '🎬 Separate',
          callback_data: `tab_${movie._id}_sep`,
        });
        buttons.push(tabRow);
      }

      // Row 2: Quality Filter Buttons (if multiple qualities exist)
      if (distinctQualities.length > 1) {
        const filterRow: any[] = [];
        filterRow.push({
          text: activeQual === 'all' ? '✅ All Quals' : '🌟 All',
          callback_data: `qfilter_${movie._id}_${activeTab}_all`,
        });
        distinctQualities.forEach((q) => {
          const isSel = q.toLowerCase() === activeQual;
          filterRow.push({
            text: isSel ? `✅ ${q}` : q,
            callback_data: `qfilter_${movie._id}_${activeTab}_${q}`,
          });
        });
        buttons.push(filterRow);
      }

      // Check if this document represents a series or episodic content
      const isSeriesDoc = isSeriesDocHelper(movie);

      // Row 3: Send All Button (with count)
      const tabNameLabel = !isSeriesDoc
        ? 'Files'
        : activeTab === 'single'
          ? 'Packs'
          : activeTab === 'sep'
            ? 'Separate Episodes'
            : 'Episodes';
      const sendAllLabel =
        activeQual !== 'all'
          ? `📥 Send All ${selectedQuality} ${tabNameLabel} (${totalFiles})`
          : `📥 Send All ${tabNameLabel} (${totalFiles})`;
      buttons.push([
        {
          text: sendAllLabel,
          callback_data: `all_${movie._id}_${activeTab}_${activeQual}`,
        },
      ]);

      // Row 4..N: File / Episode / Pack Buttons
      pageFiles.forEach(({ file, originalIndex }) => {
        const res =
          file.quality ||
          extractResolution('', file.fileName) ||
          'HD';
        const size = file.size || '';
        const fn = cleanFileName(file.fileName || '');

        let btnText: string;
        if (!isSeriesDoc) {
          // Standalone Movie: quality | size | filename
          btnText = formatButtonLabel([res, size, fn]);
        } else {
          // Series / Episodic: E01 | quality | size | filename
          const ep = file.episode || extractEpisode('', file.fileName);
          const epToken = ep ? normalizeEpisodeNumber(ep) : 'E01';
          btnText = formatButtonLabel([epToken, res, size, fn]);
        }

        buttons.push([
          {
            text: btnText,
            callback_data: `file_${movie._id}_${originalIndex}`,
          },
        ]);
      });

      // Bottom Row: Pagination Navigation
      const nav: any[] = [];
      if (validPage > 0) {
        nav.push({
          text: '◀️ Prev',
          callback_data: `page_${movie._id}_${validPage - 1}_${activeTab}_${activeQual}`,
        });
      }
      nav.push({
        text: `Page ${validPage + 1}/${totalPages}`,
        callback_data: 'noop',
      });
      if (end < totalFiles) {
        nav.push({
          text: 'Next ▶️',
          callback_data: `page_${movie._id}_${validPage + 1}_${activeTab}_${activeQual}`,
        });
      }
      buttons.push(nav);

      let headerSub = '';
      if (activeTab === 'single') headerSub = ' (Single Files / Packs)';
      else if (activeTab === 'sep') headerSub = ' (Separate Episodes)';
      if (activeQual !== 'all') headerSub += ` [${selectedQuality}]`;

      const caption = `🎬 <b>${this.escapeHtml(movie.name)}${headerSub}</b>\n<i>Select to download:</i>`;
      await this.replyOrEditEpisodePage(ctx, caption, buttons, movie);
    } catch (err: any) {
      console.error('sendEpisodePage error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Episode page  –  Anime
  // ════════════════════════════════════════════

  private async sendAnimeEpisodePage(
    ctx: any,
    anime: any,
    page: number = 0,
    selectedTab: string = 'all',
    selectedQuality: string = 'all',
  ) {
    try {
      // 1. Detect if single batch packs and/or separate episodes exist
      const hasSinglePacks = anime.files.some((f: any) => {
        const ep = f.episode || extractEpisode('', f.fileName);
        return isEpisodeRange(ep) || isEpisodeRange(f.fileName);
      });
      const hasSeparateEpisodes = anime.files.some((f: any) => {
        const ep = f.episode || extractEpisode('', f.fileName);
        return !(isEpisodeRange(ep) || isEpisodeRange(f.fileName));
      });

      const activeTab = (selectedTab || 'all').toLowerCase().trim();

      // 2. Filter files based on Category Tab (all | single | sep)
      let tabFilteredItems = anime.files.map(
        (file: any, originalIndex: number) => ({
          file,
          originalIndex,
        }),
      );

      if (activeTab === 'single') {
        tabFilteredItems = tabFilteredItems.filter((item) => {
          const ep =
            item.file.episode || extractEpisode('', item.file.fileName);
          return isEpisodeRange(ep) || isEpisodeRange(item.file.fileName);
        });
      } else if (activeTab === 'sep') {
        tabFilteredItems = tabFilteredItems.filter((item) => {
          const ep =
            item.file.episode || extractEpisode('', item.file.fileName);
          return !(isEpisodeRange(ep) || isEpisodeRange(item.file.fileName));
        });
      }

      // 3. Extract distinct qualities from the tab-filtered files
      const qualSet = new Set<string>();
      const distinctQualities: string[] = [];
      tabFilteredItems.forEach((it) => {
        const q = (
          it.file.quality ||
          extractResolution('', it.file.fileName) ||
          ''
        ).trim();
        if (q && !qualSet.has(q.toLowerCase())) {
          qualSet.add(q.toLowerCase());
          distinctQualities.push(q);
        }
      });
      distinctQualities.sort(
        (a, b) => getQualityWeight(a) - getQualityWeight(b),
      );

      // 4. Filter by quality if activeQual !== 'all'
      const activeQual = (selectedQuality || 'all').toLowerCase().trim();
      let filteredItems = tabFilteredItems;
      if (activeQual !== 'all') {
        filteredItems = filteredItems.filter((item) => {
          const res = (
            item.file.quality ||
            extractResolution('', item.file.fileName) ||
            ''
          )
            .toLowerCase()
            .trim();
          return (
            res === activeQual ||
            res.includes(activeQual) ||
            activeQual.includes(res)
          );
        });
      }

      // 5. Reverse so latest episodes appear first
      const reversedFiles = [...filteredItems].reverse();
      const totalFiles = reversedFiles.length;
      const totalPages = Math.max(1, Math.ceil(totalFiles / this.pageSize));
      const validPage = Math.min(Math.max(0, page), totalPages - 1);
      const start = validPage * this.pageSize;
      const end = start + this.pageSize;
      const pageFiles = reversedFiles.slice(start, end);

      const buttons: any[] = [];

      // Row 1: Mode Tabs [ All | Single Files | Separate ] (if both single packs and separate episodes exist)
      if (hasSinglePacks && hasSeparateEpisodes) {
        const tabRow: any[] = [];
        tabRow.push({
          text: activeTab === 'all' ? '✅ All' : '🌟 All',
          callback_data: `anime_tab_${anime._id}_all`,
        });
        tabRow.push({
          text: activeTab === 'single' ? '✅ Single Files' : '📁 Single Files',
          callback_data: `anime_tab_${anime._id}_single`,
        });
        tabRow.push({
          text: activeTab === 'sep' ? '✅ Separate' : '🎬 Separate',
          callback_data: `anime_tab_${anime._id}_sep`,
        });
        buttons.push(tabRow);
      }

      // Row 2: Quality Filter Buttons (if multiple qualities exist)
      if (distinctQualities.length > 1) {
        const filterRow: any[] = [];
        filterRow.push({
          text: activeQual === 'all' ? '✅ All Quals' : '🌟 All',
          callback_data: `anime_qfilter_${anime._id}_${activeTab}_all`,
        });
        distinctQualities.forEach((q) => {
          const isSel = q.toLowerCase() === activeQual;
          filterRow.push({
            text: isSel ? `✅ ${q}` : q,
            callback_data: `anime_qfilter_${anime._id}_${activeTab}_${q}`,
          });
        });
        buttons.push(filterRow);
      }

      // Row 3: Send All Button (with count)
      const tabNameLabel =
        activeTab === 'single'
          ? 'Packs'
          : activeTab === 'sep'
            ? 'Separate Episodes'
            : 'Episodes';
      const sendAllLabel =
        activeQual !== 'all'
          ? `📥 Send All ${selectedQuality} ${tabNameLabel} (${totalFiles})`
          : `📥 Send All ${tabNameLabel} (${totalFiles})`;
      buttons.push([
        {
          text: sendAllLabel,
          callback_data: `anime_all_${anime._id}_${activeTab}_${activeQual}`,
        },
      ]);

      // Row 4..N: Episode / Pack Buttons
      pageFiles.forEach(({ file, originalIndex }) => {
        const ep = file.episode || extractEpisode('', file.fileName);
        const epToken = ep ? normalizeEpisodeNumber(ep) : 'E01';
        const res =
          file.quality ||
          extractResolution('', file.fileName) ||
          'HD';
        const size = file.size || '';
        const fn = cleanFileName(file.fileName || '');
        const btnText = formatButtonLabel([epToken, res, size, fn]);

        buttons.push([
          {
            text: btnText,
            callback_data: `anime_file_${anime._id}_${originalIndex}`,
          },
        ]);
      });

      // Bottom Row: Pagination Navigation
      const nav: any[] = [];
      if (validPage > 0) {
        nav.push({
          text: '◀️ Prev',
          callback_data: `anime_page_${anime._id}_${validPage - 1}_${activeTab}_${activeQual}`,
        });
      }
      nav.push({
        text: `Page ${validPage + 1}/${totalPages}`,
        callback_data: 'noop',
      });
      if (end < totalFiles) {
        nav.push({
          text: 'Next ▶️',
          callback_data: `anime_page_${anime._id}_${validPage + 1}_${activeTab}_${activeQual}`,
        });
      }
      buttons.push(nav);

      let headerSub = '';
      if (activeTab === 'single') headerSub = ' (Single Files / Packs)';
      else if (activeTab === 'sep') headerSub = ' (Separate Episodes)';
      if (activeQual !== 'all') headerSub += ` [${selectedQuality}]`;

      const caption = `🎬 <b>${this.escapeHtml(anime.name)}${headerSub}</b>\n<i>Select to download:</i>`;
      await this.replyOrEditEpisodePage(ctx, caption, buttons, anime);
    } catch (err: any) {
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

      if (data.startsWith('tab_')) {
        const [, movieId, tab] = data.split('_');
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');
        return this.sendEpisodePage(ctx, movie, 0, tab, 'all');
      }

      if (data.startsWith('qfilter_')) {
        const parts = data.split('_');
        const movieId = parts[1];
        const tab = parts[2] || 'all';
        const qual = parts.slice(3).join('_') || 'all';
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');
        return this.sendEpisodePage(ctx, movie, 0, tab, qual);
      }

      if (data.startsWith('page_')) {
        const parts = data.split('_');
        const movieId = parts[1];
        const pageStr = parts[2];
        const tab = parts[3] || 'all';
        const qual = parts.slice(4).join('_') || 'all';
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');
        return this.sendEpisodePage(
          ctx,
          movie,
          parseInt(pageStr, 10),
          tab,
          qual,
        );
      }

      if (data.startsWith('all_')) {
        const parts = data.split('_');
        const movieId = parts[1];
        const tab = parts[2] || 'all';
        const qual = parts.slice(3).join('_') || 'all';
        const movie = await this.movieModel.findById(movieId);
        if (!movie) return ctx.reply('❌ Movie not found.');

        let filesToSend = movie.files;
        if (tab === 'single') {
          filesToSend = filesToSend.filter((f: any) => {
            const ep = f.episode || extractEpisode('', f.fileName);
            return isEpisodeRange(ep) || isEpisodeRange(f.fileName);
          });
        } else if (tab === 'sep') {
          filesToSend = filesToSend.filter((f: any) => {
            const ep = f.episode || extractEpisode('', f.fileName);
            return !(isEpisodeRange(ep) || isEpisodeRange(f.fileName));
          });
        }

        if (qual !== 'all') {
          const target = qual.toLowerCase().trim();
          filesToSend = filesToSend.filter((f: any) => {
            const res = (
              f.quality ||
              extractResolution('', f.fileName) ||
              ''
            )
              .toLowerCase()
              .trim();
            return (
              res === target || res.includes(target) || target.includes(res)
            );
          });
        }
        await this.sendAllFiles(ctx, filesToSend, movie.name);
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
    } catch (err: any) {
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

      if (data.startsWith('anime_tab_')) {
        const parts = data.split('_');
        const animeId = parts[2];
        const tab = parts[3] || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendAnimeEpisodePage(ctx, anime, 0, tab, 'all');
      }

      if (data.startsWith('anime_qfilter_')) {
        const parts = data.split('_');
        const animeId = parts[2];
        const tab = parts[3] || 'all';
        const qual = parts.slice(4).join('_') || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendAnimeEpisodePage(ctx, anime, 0, tab, qual);
      }

      if (data.startsWith('anime_page_')) {
        const parts = data.split('_');
        const animeId = parts[2];
        const pageStr = parts[3];
        const tab = parts[4] || 'all';
        const qual = parts.slice(5).join('_') || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendAnimeEpisodePage(
          ctx,
          anime,
          parseInt(pageStr, 10),
          tab,
          qual,
        );
      }

      if (data.startsWith('anime_all_')) {
        const parts = data.split('_');
        const animeId = parts[2];
        const tab = parts[3] || 'all';
        const qual = parts.slice(4).join('_') || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');

        let filesToSend = anime.files;
        if (tab === 'single') {
          filesToSend = filesToSend.filter((f: any) => {
            const ep = f.episode || extractEpisode('', f.fileName);
            return isEpisodeRange(ep) || isEpisodeRange(f.fileName);
          });
        } else if (tab === 'sep') {
          filesToSend = filesToSend.filter((f: any) => {
            const ep = f.episode || extractEpisode('', f.fileName);
            return !(isEpisodeRange(ep) || isEpisodeRange(f.fileName));
          });
        }

        if (qual !== 'all') {
          const target = qual.toLowerCase().trim();
          filesToSend = anime.files.filter((f: any) => {
            const res = (
              f.quality ||
              extractResolution('', f.fileName) ||
              ''
            )
              .toLowerCase()
              .trim();
            return (
              res === target || res.includes(target) || target.includes(res)
            );
          });
        }
        await this.sendAllFiles(ctx, filesToSend, anime.name);
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
    } catch (err: any) {
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
        `<b>🤖 My Name</b>: <a href="https://t.me/${this.movieBotUsername}">Movie Bot</a> ⚡️\n` +
          `<b>📝 Language</b>: <a href="https://nestjs.com/">Nest JS</a>\n` +
          `<b>🚀 Server</b>: <a href="https://vercel.com/">Vercel</a>\n` +
          `<b>📢 Channel</b>: <a href="${this.promoChannelUrl}">Lord Fourth Movie Tamil</a>`,
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
        this.defaultTtlMs,
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
                { text: '⚙️ Support', url: this.supportGroupUrl },
              ],
              [{ text: 'Developer', url: this.developerUrl }],
            ],
          },
        },
      );
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        this.defaultTtlMs,
        ctx.from.id,
      );
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
        return ctx.reply('⚠️ No Requested Movies Found', {
          parse_mode: 'HTML',
        });

      let msg = `<b><u>Requested Movies</u></b>\n\n`;
      requests.forEach((m, i) => {
        msg += `<b>${i + 1}. <code>${m.name}</code></b>\n`;
      });

      const rm = await ctx.reply(msg, { parse_mode: 'HTML' });
      await this.saveTempMessage(rm.chat.id, rm.message_id, this.defaultTtlMs);
    } catch (err) {
      console.error('requestedMovies error:', err);
    }
  }

  async deleteRequestedMovies(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply(
          '⚠️ Please provide a movie name.\nEg: /drm <movieName>',
          {
            parse_mode: 'HTML',
          },
        );
      await this.requestModel.deleteMany({ name: input });
      await ctx.reply('✅ Requested Movie Deleted Successfully', {
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('deleteRequestedMovies error:', err);
    }
  }

  async searchMovie(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ');
      if (!input)
        return ctx.reply(
          '⚠️ Please provide a movie name.\nEg: /sm <movieName>',
          {
            parse_mode: 'HTML',
          },
        );

      const movies = await this.movieModel.find({
        name: { $regex: input, $options: 'i' },
      });
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
      const input = ctx.message.text.split(' ').slice(1).join(' ').trim();
      if (!input) {
        return ctx.reply(
          '⚠️ <b>Please provide a Movie Name or MongoDB ID to delete:</b>\n\n' +
            '<code>/dm Leo</code> or <code>/dm 6aa56ed6a639e988fc997ffd</code>',
          { parse_mode: 'HTML' },
        );
      }

      // 1. Direct MongoDB ID match
      if (/^[0-9a-fA-F]{24}$/.test(input)) {
        let doc: any = await this.movieModel.findById(input);
        let docType = 'movie';
        if (!doc) {
          doc = await this.animeModel.findById(input);
          docType = 'anime';
        }
        if (doc) {
          return this.sendDeleteConfirmation(ctx, doc, docType);
        }
      }

      // 2. Search in Movies and Animes by regex
      const movieMatches = await this.movieModel.find({
        name: { $regex: this.escapeRegex(input), $options: 'i' },
      });
      const animeMatches = await this.animeModel.find({
        name: { $regex: this.escapeRegex(input), $options: 'i' },
      });

      const allMatches: { doc: any; type: 'movie' | 'anime' }[] = [
        ...movieMatches.map((m) => ({ doc: m, type: 'movie' as const })),
        ...animeMatches.map((a) => ({ doc: a, type: 'anime' as const })),
      ];

      if (allMatches.length === 0) {
        return ctx.reply(
          `<b>🚫 No Movies or Animes found matching:</b> "<code>${this.escapeHtml(input)}</code>"`,
          { parse_mode: 'HTML' },
        );
      }

      // Single match -> show confirmation preview directly
      if (allMatches.length === 1) {
        return this.sendDeleteConfirmation(
          ctx,
          allMatches[0].doc,
          allMatches[0].type,
        );
      }

      // Multiple matches -> show interactive selector list
      let msg = `<b>🗑️ <u>Multiple Matches Found (${allMatches.length})</u></b>\n\n`;
      msg += `<i>Select which item you want to delete:</i>\n\n`;

      const buttons: any[] = [];
      allMatches.forEach(({ doc, type }) => {
        const year = doc.year ? ` • ${doc.year}` : '';
        const season = doc.season ? ` • ${doc.season}` : '';
        const filesCount = doc.files ? ` • ${doc.files.length} Files` : '';
        const icon = type === 'anime' ? '🎌' : '🎬';
        const btnText = `${icon} ${doc.name}${year}${season}${filesCount}`;

        buttons.push([
          {
            text: btnText.length > 55 ? btnText.slice(0, 52) + '...' : btnText,
            callback_data: `dm_view_${type}_${doc._id}`,
          },
        ]);
      });

      buttons.push([{ text: '❌ Cancel', callback_data: 'dm_cancel' }]);

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err: any) {
      console.error('deleteMovieInDB error:', err.message);
    }
  }

  private async sendDeleteConfirmation(
    ctx: any,
    doc: any,
    type: string,
    isEdit = false,
  ) {
    const year = doc.year ? `${doc.year}` : 'N/A';
    const season = doc.season ? `${doc.season}` : 'N/A';
    const quality = doc.quality || 'N/A';
    const fileCount = doc.files?.length || 0;
    const icon = type === 'anime' ? '🎌 Anime' : '🎬 Movie';

    let caption = `<b>⚠️ <u>CONFIRM DELETION</u></b>\n\n`;
    caption += `📌 <b>Type :</b> ${icon}\n`;
    caption += `🎬 <b>Title :</b> <code>${this.escapeHtml(doc.name)}</code>\n`;
    caption += `🗓️ <b>Year :</b> ${year}\n`;
    caption += `💾 <b>Season :</b> ${season}\n`;
    caption += `💿 <b>Quality :</b> ${quality}\n`;
    caption += `📂 <b>Total Files :</b> ${fileCount} files\n`;
    caption += `🆔 <b>Doc ID :</b> <code>${doc._id}</code>\n\n`;
    caption += `<b>⚠️ Are you sure you want to PERMANENTLY delete this from Database?</b>\n`;
    caption += `<i>This action cannot be undone!</i>`;

    const buttons = [
      [
        {
          text: '🔴 Yes, Delete Permanently',
          callback_data: `dm_del_${type}_${doc._id}`,
        },
      ],
      [{ text: '❌ Cancel', callback_data: 'dm_cancel' }],
    ];

    if (isEdit && ctx.updateType === 'callback_query') {
      await ctx.editMessageText(caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } else {
      await ctx.reply(caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    }
  }

  private async handleDeleteMovieCallback(ctx: any) {
    try {
      await ctx.answerCbQuery();
      if (!this.checkOwner(ctx)) return;

      const data: string = ctx.callbackQuery.data;

      if (data === 'dm_cancel') {
        await ctx.editMessageText('<b>❌ Deletion cancelled.</b>', {
          parse_mode: 'HTML',
        });
        return;
      }

      if (data.startsWith('dm_view_')) {
        const parts = data.split('_');
        const type = parts[2];
        const docId = parts[3];
        const doc: any =
          type === 'anime'
            ? await this.animeModel.findById(docId)
            : await this.movieModel.findById(docId);
        if (!doc) {
          return ctx.editMessageText('<b>⚠️ Item not found in Database.</b>', {
            parse_mode: 'HTML',
          });
        }
        return this.sendDeleteConfirmation(ctx, doc, type, true);
      }

      if (data.startsWith('dm_del_')) {
        const parts = data.split('_');
        const type = parts[2];
        const docId = parts[3];
        const doc: any =
          type === 'anime'
            ? await this.animeModel.findById(docId)
            : await this.movieModel.findById(docId);
        if (!doc) {
          return ctx.editMessageText(
            '<b>⚠️ Item already deleted or not found.</b>',
            {
              parse_mode: 'HTML',
            },
          );
        }
        const docName = doc.name;
        if (type === 'anime') {
          await this.animeModel.findByIdAndDelete(docId);
        } else {
          await this.movieModel.findByIdAndDelete(docId);
        }

        await ctx.editMessageText(
          `<b>🗑️ Successfully Deleted!</b>\n\n` +
            `🎬 <b>${this.escapeHtml(docName)}</b> (<code>${docId}</code>) has been permanently removed from the Database.`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (err: any) {
      console.error('handleDeleteMovieCallback error:', err.message);
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
      try {
        const posterMsg = await ctx.telegram.copyMessage(
          ctx.chat.id,
          doc.poster.chatId,
          doc.poster.messageId,
        );
        await this.saveTempMessage(
          ctx.chat.id,
          posterMsg.message_id,
          this.fileTtlMs,
          ctx.from.id,
        );
      } catch (err: any) {
        console.warn(
          `⚠️ [tryCopyPoster] Failed to copy poster from Storage Channel (${doc.poster.chatId}): ${err.message}. (Ensure your bot is added to that storage channel if you want posters forwarded)`,
        );
      }
    }
  }

  private async sendAllFiles(ctx: any, files: any[], name: string) {
    let sentCount = 0;
    for (const file of files) {
      try {
        let message: any = null;
        if (file.chatId && file.messageId) {
          try {
            message = await ctx.telegram.copyMessage(
              ctx.chat.id,
              file.chatId,
              file.messageId,
            );
          } catch (copyErr: any) {
            console.warn(
              `copyMessage failed, trying fileId fallback: ${copyErr.message}`,
            );
          }
        }
        if (!message && file.fileId) {
          message = await ctx.replyWithDocument(file.fileId, {
            caption: file.fileName || name,
          });
        }
        if (message) {
          sentCount++;
          await this.saveTempMessage(
            ctx.chat.id,
            message.message_id,
            this.fileTtlMs,
            ctx.from.id,
          );
        }
      } catch (err: any) {
        console.error('sendAllFiles file error:', err.message);
      }
    }
    if (sentCount > 0) {
      await this.replyFilesSent(ctx, name);
    }
  }

  private async sendSingleFile(ctx: any, file: any, name: string) {
    try {
      let message: any = null;
      if (file.chatId && file.messageId) {
        try {
          message = await ctx.telegram.copyMessage(
            ctx.chat.id,
            file.chatId,
            file.messageId,
          );
        } catch (copyErr: any) {
          console.warn(
            `copyMessage failed, trying fileId fallback: ${copyErr.message}`,
          );
        }
      }
      if (!message && file.fileId) {
        message = await ctx.replyWithDocument(file.fileId, {
          caption: file.fileName || name,
        });
      }
      if (message) {
        await this.saveTempMessage(
          ctx.chat.id,
          message.message_id,
          this.fileTtlMs,
          ctx.from.id,
        );
        await this.replyFilesSent(ctx, name);
      }
    } catch (err: any) {
      console.error('sendSingleFile error:', err.message);
    }
  }

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
      this.fileTtlMs,
      ctx.from.id,
    );
  }

  private async replyNotFound(ctx: any, searchName: string) {
    return await ctx.reply(
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
                url: `https://www.google.com/search?q=${encodeURIComponent(searchName)}`,
              },
            ],
            [
              {
                text: 'Request Movie in Group',
                url: this.supportGroupUrl,
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
      await this.saveTempMessage(
        ctx.chat.id,
        msg.message_id,
        this.fileTtlMs,
        ctx.from.id,
      );
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
      text: `Page ${page + 1}/${totalPages}`,
      callback_data: 'noop',
    });
    if (end < totalFiles)
      nav.push({ text: 'Next ➡️', callback_data: `${prefix}_${page + 1}` });
    return nav;
  }

  // ════════════════════════════════════════════
  //  Fuzzy-search helpers
  // ════════════════════════════════════════════

  findTopMatches(input: string, docs: any[], minScore?: number) {
    const threshold = minScore ?? this.fuzzyMinScore;
    return docs
      .map((doc) => ({
        doc,
        score: ratio(input.toLowerCase(), doc.name.toLowerCase()),
      }))
      .filter((r) => r.score >= threshold)
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

function extractEpisode(text?: string, fileName?: string): string | null {
  const combined = `${text || ''}\n${fileName || ''}`;
  if (!combined.trim()) return null;

  const episodeLineMatch = combined.match(/(?:📍)?\s*Episode\s*:\s*(.+)/i);
  if (episodeLineMatch) {
    const raw = episodeLineMatch[1].trim();
    const clean = raw.split('\n')[0].trim();
    if (clean.toUpperCase().startsWith('E')) {
      return clean.toUpperCase();
    }
    return `E${clean}`;
  }

  const seMatch = combined.match(/S\d{1,2}\s*E(\d{1,4}(?:-\d{1,4})?)/i);
  if (seMatch) {
    return `E${seMatch[1]}`;
  }

  const epMatch = combined.match(
    /(?:EP|Episode)\s*\(?(\d{1,4}(?:-\d{1,4})?)\)?/i,
  );
  if (epMatch) {
    return `E${epMatch[1]}`;
  }

  return null;
}

function isEpisodeRange(ep?: string | null): boolean {
  if (!ep) return false;
  const clean = ep.trim().toUpperCase();
  if (/BATCH|COMPLETE|ZIP|PACK/i.test(clean)) return true;
  if (clean.length < 25) {
    if (/^E?(\d+)\s*-\s*E?(\d+)$/.test(clean)) return true;
    if (/EP(?:ISODE)?\s*\(?(\d+)\s*-\s*(\d+)\)?/i.test(clean)) return true;
  }
  if (/(?:EP|EPISODE|E)\s*\(?(\d+)\s*-\s*E?(\d+)\)?/i.test(clean)) return true;
  if (/EPISODES?\s*\(?(\d+)\s*-\s*(\d+)\)?/i.test(clean)) return true;
  return false;
}

function normalizeEpisodeNumber(ep?: string | null): string {
  if (!ep) return 'E01';
  const clean = ep.trim().toUpperCase();

  const rangeMatch = clean.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const start = rangeMatch[1].padStart(2, '0');
    const end = rangeMatch[2].padStart(2, '0');
    return `E${start}-${end}`;
  }

  const numMatch = clean.match(/(\d+)/);
  if (numMatch) {
    return `E${numMatch[1].padStart(2, '0')}`;
  }
  return clean.startsWith('E') ? clean : `E${clean}`;
}

function formatEpisodeDisplayName(epKey: string): string {
  if (!epKey) return 'Episode 01';
  const clean = epKey.trim();
  const rangeMatch = clean.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const start = rangeMatch[1].padStart(2, '0');
    const end = rangeMatch[2].padStart(2, '0');
    return `Episode (${start}-${end})`;
  }
  const numMatch = clean.match(/(\d+)/);
  if (numMatch) {
    return `Episode ${numMatch[1].padStart(2, '0')}`;
  }
  return clean.startsWith('Episode') ? clean : `Episode ${clean}`;
}

function extractResolution(text?: string, fileName?: string): string | null {
  const combined = `${text || ''}\n${fileName || ''}`;
  if (!combined.trim()) return null;

  const resMatch = combined.match(
    /\b(2160p|4K|1080p\s*10Bit|1080p|720p\s*10Bit|720p|480p|360p)\b/i,
  );
  if (resMatch) {
    return resMatch[1].trim();
  }
  return null;
}

function getQualityWeight(resStr: string): number {
  if (!resStr) return 0;
  const s = resStr.toLowerCase();
  if (s.includes('4k') || s.includes('2160p') || s.includes('uhd')) return 2160;
  if (s.includes('1080p') && s.includes('10bit')) return 1081;
  if (s.includes('1080p')) return 1080;
  if (s.includes('720p') && s.includes('10bit')) return 721;
  if (s.includes('720p')) return 720;
  if (s.includes('480p')) return 480;
  if (s.includes('360p')) return 360;
  if (s.includes('240p')) return 240;
  const numMatch = s.match(/(\d{3,4})p/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
}

function extractAudioList(text?: string): string[] {
  if (!text) return [];

  const langMap: Record<string, string> = {
    tam: 'Tamil',
    tamil: 'Tamil',
    tel: 'Telugu',
    telugu: 'Telugu',
    hin: 'Hindi',
    hindi: 'Hindi',
    eng: 'English',
    english: 'English',
    mal: 'Malayalam',
    malayalam: 'Malayalam',
    kan: 'Kannada',
    kannada: 'Kannada',
    kor: 'Korean',
    korean: 'Korean',
    jap: 'Japanese',
    japanese: 'Japanese',
    chi: 'Chinese',
    chinese: 'Chinese',
    fre: 'French',
    french: 'French',
    ger: 'German',
    german: 'German',
    spa: 'Spanish',
    spanish: 'Spanish',
  };

  const audioLineMatch = text.match(
    /(?:🔈|🔉|🔊|🎙️)?\s*(?:Audio|Language)\s*:\s*(.+)/iu,
  );
  let rawAudio = '';
  if (audioLineMatch) {
    rawAudio = audioLineMatch[1].trim();
  } else {
    const bracketMatch = text.match(/\[([a-z\s+,/]+)\]/i);
    if (bracketMatch) {
      rawAudio = bracketMatch[1].trim();
    }
  }

  if (!rawAudio) return [];

  const tokens = rawAudio
    .split(/[\s+,/]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const result: string[] = [];
  for (const token of tokens) {
    const matched = langMap[token];
    if (matched && !result.includes(matched)) {
      result.push(matched);
    } else if (
      token.length > 2 &&
      !result.includes(token.charAt(0).toUpperCase() + token.slice(1))
    ) {
      if (
        !['and', 'esub', 'aac', 'ddp', 'atmos', 'dts', 'true'].includes(token)
      ) {
        result.push(token.charAt(0).toUpperCase() + token.slice(1));
      }
    }
  }

  return result;
}

function cleanFileName(raw?: string | null): string {
  if (!raw) return '';
  let name = String(raw).replace(/[\r\n]+/g, ' ').trim();
  name = name.replace(/^.*?:-\s*/, '');
  name = name.replace(/^@\S+\s*/, '');
  name = name.replace(/(?:🔊|🔈|🔉|🎙️?)\s*(?:Audio|Language)\s*:\s*.+/giu, '').trim();
  name = name.replace(/^[-_\s]+/, '').trim();
  return name.trim();
}

function formatButtonLabel(
  parts: (string | undefined | null)[],
  maxLen = 64,
): string {
  const validParts = parts.map((p) => (p || '').trim()).filter(Boolean);
  let text = validParts.join(' | ');
  if (!text) return '📁 Direct File';
  if (text.length > maxLen) {
    text = text.slice(0, maxLen - 3).trim() + '...';
  }
  return text;
}

function isSeriesDocHelper(doc: any): boolean {
  if (!doc) return false;
  return Boolean(
    doc.season ||
      /S\d{1,2}/i.test(doc.name || '') ||
      /Season\s*\d+/i.test(doc.name || '') ||
      (Array.isArray(doc.files) &&
        doc.files.some((f: any) => {
          const ep = f.episode || extractEpisode('', f.fileName);
          return Boolean(ep) || Boolean(f.season) || isEpisodeRange(f.fileName);
        })),
  );
}