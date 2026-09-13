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
import { SettingsService } from '../settings/settings.service';

type ChannelInfo = {
  id: string;
  text: string;
  url: string;
};

@Injectable()
export class AnimeService implements OnModuleInit {
  public bot: Telegraf;

  constructor(
    @InjectModel(Anime.name) private animeModel: Model<Anime>,
    @InjectModel(AnimeUser.name) private userModel: Model<AnimeUser>,
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
    private settingsService: SettingsService,
  ) {
    this.bot = new Telegraf(this.configService.get('ANIME_BOT_TOKEN')!);
  }

  // ─────────────────────────────────────────────
  //  Live Configuration Getters (from SettingsService)
  // ─────────────────────────────────────────────

  public get ownerId(): number {
    return this.settingsService.ownerId;
  }

  public get channels(): ChannelInfo[] {
    return this.settingsService.animeForceSubChannels;
  }

  public get pageSize(): number {
    return this.settingsService.filesPerPage;
  }

  public get listPageSize(): number {
    return this.settingsService.listPageSize;
  }

  public get fileTtlMs(): number {
    return this.settingsService.fileTtlMs;
  }

  public get defaultTtlMs(): number {
    return this.settingsService.defaultTtlMs;
  }

  public get fuzzyMinScore(): number {
    return this.settingsService.fuzzyMinScore;
  }

  public get startGifId(): string {
    return this.settingsService.animeStartGifId;
  }

  public get loadingStickerId(): string {
    return this.settingsService.animeLoadingStickerId;
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

  public get searchGroupUrl(): string {
    return this.settingsService.searchGroupUrl;
  }

  public get searchGroupText(): string {
    return this.settingsService.searchGroupText;
  }

  // ════════════════════════════════════════════
  //  Auth helpers
  // ════════════════════════════════════════════

  private checkOwner(ctx: any): boolean {
    if (!this.settingsService.isOwner(ctx.from?.id)) {
      ctx.reply(
        `<b>🚫 You are not authorized to use this bot.</b> \n\n\n @${this.animeBotUsername} Here You Can Get the Animes`,
        { parse_mode: 'HTML' },
      );
      return false;
    }
    return true;
  }

  private async checkSubscription(ctx: any): Promise<boolean> {
    try {
      const notJoinedChannels: ChannelInfo[] = [];

      for (const channel of this.channels) {
        try {
          const member = await ctx.telegram.getChatMember(
            channel.id,
            ctx.from.id,
          );
          if (member.status === 'left' || member.status === 'kicked') {
            notJoinedChannels.push(channel);
          }
        } catch (err: any) {
          console.error(
            `⚠️ [AnimeBot checkSubscription] Error for channel "${channel.text}" (ID: ${channel.id}): ${err.message}. Ensure your test bot is added as an ADMIN to this channel!`,
          );
          notJoinedChannels.push(channel);
        }
      }

      if (notJoinedChannels.length === 0) return true;

      const channel1And2 = notJoinedChannels
        .filter((ch) => ch.text !== 'Main Channel')
        .map((ch) => ({ text: ch.text, url: ch.url }));

      const mainChannel = notJoinedChannels.find(
        (ch) => ch.text === 'Main Channel',
      );

      const keyboard: any[] = [];
      if (channel1And2.length > 0) keyboard.push(channel1And2);
      if (mainChannel)
        keyboard.push([{ text: mainChannel.text, url: mainChannel.url }]);
      keyboard.push([{ text: '🔄 Try Again', callback_data: 'check_join' }]);

      const subCaption =
        `Hi ${ctx.from.first_name},\n\n` +
        `<b>Intha channel la join pannunga</b>\n\n` +
        `Movies direct-ah channel-la post pannuvom.\n` +
        `Updates miss pannaama irukka join pannunga.\n\n` +
        `👇 Keela irukkura button click pannunga`;

      let sentSub = false;
      if (this.startGifId) {
        try {
          await ctx.replyWithAnimation(this.startGifId, {
            caption: subCaption,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
          sentSub = true;
        } catch (e: any) {
          console.warn('AnimeBot checkSubscription animation failed, falling back to text:', e.message);
        }
      }

      if (!sentSub) {
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
  //  Lifecycle
  // ════════════════════════════════════════════

  async onModuleInit() {
    this.bot.start(async (ctx) => {
      try { await this.reactMessage(ctx); } catch (e) { console.log(e); }

      let payload = ctx.payload || ctx.message?.text?.split(' ').slice(1).join(' ');
      if (payload) {
        try { payload = Buffer.from(payload, 'base64').toString('utf-8'); }
        catch (e) { payload = decodeURIComponent(payload); console.log('Payload:', e.message); }
      }
      console.log('Payload:', payload);
      await this.start(ctx, payload);
    });

    this.bot.command('help', (ctx) => this.help(ctx));
    this.bot.command('list', async (ctx) => { await this.sendAnimeList(ctx, 1, false); });
    this.bot.action(/^list_page_(\d+)$/, async (ctx) => {
      const page = parseInt(ctx.match[1]);
      await this.sendAnimeList(ctx, page, true);
    });
    this.bot.command('broadcast', (ctx) => this.broadcast(ctx));
    this.bot.command('da', (ctx) => this.deleteAnimeInDB(ctx));
    this.bot.command('dm', (ctx) => this.deleteAnimeInDB(ctx));
    this.bot.command('settings', (ctx) => this.settingsService.renderMainDashboard(ctx));
    this.bot.command('cancel', (ctx) => this.settingsService.handleAdminInput(ctx));

    // ── Inline-keyboard actions ───────────────
    this.bot.action(/^sett_/, (ctx) => this.settingsService.handleCallbackQuery(ctx));
    this.bot.on('text', (ctx) => this.sendAnime(ctx));
    this.bot.on(['photo', 'animation', 'document', 'sticker'], (ctx) =>
      this.settingsService.handleAdminInput(ctx),
    );
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
    this.bot.action(/^(all|file|page|qfilter|tab)_/, (ctx) => this.handleEpisodeSelection(ctx));
    this.bot.action(/^(da|dm)_/, (ctx) => this.handleDeleteAnimeCallback(ctx));
    this.bot.action('noop', async (ctx) => { await ctx.answerCbQuery('❌ This Not a Button'); });

    const isPolling = this.configService.get('BOT_MODE') === 'polling';
    if (isPolling) {
      try {
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
        this.bot.launch(() => {
          console.log('🚀 [Dev Mode] Anime Bot started in Long Polling mode');
        });
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
      } catch (err: any) {
        console.error('Failed to launch Anime Bot polling:', err.message);
      }
    } else {
      console.log('🌐 [Prod Mode] Anime Bot Webhook mode active');
    }
  }

  // ════════════════════════════════════════════
  //  /start
  // ════════════════════════════════════════════

  async start(ctx: any, payload?: string) {
    try {
      const isJoined = await this.checkSubscription(ctx);
      if (!isJoined) return;

      if (payload) {
        await this.sendAnimeName(ctx, payload);
        return;
      }

      const userName = ctx.from.username;
      const startCaption =
        `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a>\n\n` +
        `<i>I'm your friendly Anime Bot 🤖</i>\n\n` +
        `<b>Here, you can get anime files directly</b> — no link shorteners, no ads, just pure animes! 🍿\n\n` +
        `👉 <b>Send the correct anime name</b>, and if it's available in my database, you'll get the <b>file instantly!</b>\n\n` +
        `⚡<i>Enjoy your anime time! 🎥💫</i>`;

      const startMarkup = {
        inline_keyboard: [
          [
            { text: 'Anime Bot', url: `https://t.me/${this.animeBotUsername}` },
            { text: 'Movie Bot', url: `https://t.me/${this.movieBotUsername}` },
          ],
          [
            { text: '📃 List of Anime', callback_data: 'list' },
            { text: 'ℹ️ Help', callback_data: 'help' },
          ],
          [
            { text: '👨‍💻 About', callback_data: 'about' },
            { text: '⚙️ Support', url: this.supportGroupUrl },
          ],
          [{ text: 'Developer', url: this.developerUrl }],
        ],
      };

      let message: any;
      if (this.startGifId) {
        try {
          message = await ctx.replyWithAnimation(this.startGifId, {
            caption: startCaption,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: startMarkup,
          });
        } catch (e: any) {
          console.warn('AnimeBot start animation failed, falling back to text:', e.message);
        }
      }

      if (!message) {
        message = await ctx.reply(startCaption, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: startMarkup,
        });
      }

      await this.saveTempMessage(ctx.chat.id, message.message_id, this.defaultTtlMs, ctx.from.id);

      const user = await this.userModel.findOne({ telegramId: ctx.from.id });
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

  // ════════════════════════════════════════════
  //  /list
  // ════════════════════════════════════════════

  async sendAnimeList(ctx: any, page = 1, isEdit = false) {
    try {
      const limit = this.listPageSize;
      const skip = (page - 1) * limit;
      const totalAnimes = await this.animeModel.countDocuments();
      const totalPages = Math.ceil(totalAnimes / limit);
      const anime = await this.animeModel.find({}, 'name').skip(skip).limit(limit);

      if (!anime.length) {
        return ctx.reply('<b>😢 No Animes available.</b>', { parse_mode: 'HTML' });
      }

      let msg = `<b><u>Available Animes :</u></b>\n\n🎬 <b>Page ${page}</b>\n\n`;
      anime.forEach((m, i) => (msg += `<b>${skip + i + 1}. <code>${m.name}</code></b>\n`));
      msg += `\n👉 Type the <b>Anime Name</b> to get anime.\n`;

      const buttons: { text: string; callback_data: string }[] = [];
      if (page > 1) buttons.push({ text: '⬅️ Back', callback_data: `list_page_${page - 1}` });
      buttons.push({ text: `Page ${page}/${totalPages}`, callback_data: 'noop' });
      if (skip + limit < totalAnimes) buttons.push({ text: 'Next ➡️', callback_data: `list_page_${page + 1}` });

      if (isEdit) {
        await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [buttons] } });
      } else {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [buttons] } });
      }
    } catch (err) {
      console.error('List command error:', err.message);
      ctx.reply('⚠️ Error occurred while processing the command.');
    }
  }

  // ════════════════════════════════════════════
  //  Plain text → search
  // ════════════════════════════════════════════

  async sendAnime(ctx: any) {
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

    // ✅ Enable direct search in PM for Admin / Owner
    if (this.settingsService.isOwner(ctx.from?.id)) {
      const text = ctx.message?.text?.trim();
      if (text) {
        return this.sendAnimeName(ctx, text);
      }
    }

    try {
      const searchGroupUrl = this.searchGroupUrl;
      const searchGroupText = this.searchGroupText;

      const msg = await ctx.reply(
        `👋 <i>Hi ${ctx.from.first_name || 'there'}</i>,\n\n` +
          `🚫 <b>Direct Search is disabled in this Bot!</b>\n\n` +
          `👉 <b>Anime search panna keela irukkura Group-la join pannunga:</b>\n` +
          `Group-la anime name send panna bot ungalukku direct-ah files anupidum. 🍿`,
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
      console.error('sendAnime error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Deep-link entry
  // ════════════════════════════════════════════

  async sendAnimeName(ctx: any, name?: string) {
    const ani = await ctx.replyWithAnimation(this.loadingStickerId);

    try {
      const searchText = name?.trim() ?? '';
      if (!searchText) {
        await ctx.deleteMessage(ani.message_id);
        return;
      }

      // ── Format 0: Direct single file payload (file:<animeId>:<fileIndex> or file_<animeId>_<fileIndex>) ──
      if (searchText.startsWith('file:') || searchText.startsWith('file_')) {
        await ctx.deleteMessage(ani.message_id);
        const separator = searchText.startsWith('file:') ? ':' : '_';
        const parts = searchText.split(separator);
        const animeId = parts[1];
        const idx = parseInt(parts[2], 10);
        const anime = await this.animeModel.findById(animeId);
        if (anime && anime.files && anime.files[idx]) {
          await this.sendSingleFile(ctx, anime.files[idx], anime.name);
          return;
        }
        if (anime) {
          if (anime.poster?.chatId && anime.poster?.messageId) {
            const posterMsg = await ctx.telegram.copyMessage(
              ctx.chat.id, anime.poster.chatId, anime.poster.messageId,
            );
            await this.saveTempMessage(ctx.chat.id, posterMsg.message_id, this.fileTtlMs);
          }
          return this.sendEpisodePage(ctx, anime, 0);
        }
      }

      // ── Format 0.2: Direct episode payload (epi:<animeId>:<epKey> or epi_<animeId>_<epKey>) ──
      if (searchText.startsWith('epi:') || searchText.startsWith('epi_')) {
        await ctx.deleteMessage(ani.message_id);
        const separator = searchText.startsWith('epi:') ? ':' : '_';
        const parts = searchText.split(separator);
        const animeId = parts[1];
        const epKey = parts.slice(2).join(separator);
        const anime = await this.animeModel.findById(animeId);
        if (anime && anime.files && anime.files.length > 0) {
          const normKey = normalizeEpisodeNumber(epKey);
          const matchingFiles: { file: any; originalIndex: number }[] = [];
          anime.files.forEach((file: any, idx: number) => {
            const ep = file.episode || extractEpisode('', file.fileName);
            if (normalizeEpisodeNumber(ep) === normKey) {
              matchingFiles.push({ file, originalIndex: idx });
            }
          });

          if (matchingFiles.length === 1) {
            await this.sendSingleFile(ctx, matchingFiles[0].file, anime.name);
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

            if (anime.poster?.chatId && anime.poster?.messageId) {
              const posterMsg = await ctx.telegram.copyMessage(
                ctx.chat.id,
                anime.poster.chatId,
                anime.poster.messageId,
              );
              await this.saveTempMessage(
                ctx.chat.id,
                posterMsg.message_id,
                this.fileTtlMs,
              );
            }

            const buttons: any[] = [];
            matchingFiles.forEach(({ file, originalIndex }) => {
              const res =
                file.quality ||
                extractResolution('', file.fileName) ||
                'HD';
              const size = file.size || '';
              let audios: string[] = [];
              if (Array.isArray(file.audio) && file.audio.length > 0) {
                audios = file.audio;
              } else if (typeof file.audio === 'string' && file.audio.trim()) {
                audios = [file.audio.trim()];
              } else {
                audios = extractAudioList(file.fileName || '');
              }
              const audioStr =
                audios.length > 0
                  ? audios.join(' + ')
                  : anime.audio && anime.audio.length > 0
                    ? (Array.isArray(anime.audio)
                        ? anime.audio.join(' + ')
                        : anime.audio)
                    : '';

              const parts: string[] = [];
              if (res) parts.push(`[${res}]`);
              if (size) parts.push(`[${size}]`);
              if (audioStr) parts.push(`[${audioStr}]`);

              const btnText = parts.join(' - ');
              buttons.push([
                {
                  text: btnText,
                  callback_data: `anime_file_${anime._id}_${originalIndex}`,
                },
              ]);
            });

            const epDisplay = formatEpisodeDisplayName(normKey);
            const caption = `🎬 <b>${this.escapeHtml(anime.name)}</b>\n📍 <b>${epDisplay}</b> — <i>Select Quality:</i>`;
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
          }
        }
        if (anime) {
          if (anime.poster?.chatId && anime.poster?.messageId) {
            const posterMsg = await ctx.telegram.copyMessage(
              ctx.chat.id,
              anime.poster.chatId,
              anime.poster.messageId,
            );
            await this.saveTempMessage(
              ctx.chat.id,
              posterMsg.message_id,
              this.fileTtlMs,
            );
          }
          return this.sendEpisodePage(ctx, anime, 0);
        }
      }

      // ── Format 0.3: Direct quality payload (qual:<animeId>:<quality> or qual_<animeId>_<quality>) ──
      if (searchText.startsWith('qual:') || searchText.startsWith('qual_')) {
        await ctx.deleteMessage(ani.message_id);
        const separator = searchText.startsWith('qual:') ? ':' : '_';
        const parts = searchText.split(separator);
        const animeId = parts[1];
        const targetQual = parts.slice(2).join(separator).toLowerCase().trim();
        const anime = await this.animeModel.findById(animeId);
        if (anime && anime.files && anime.files.length > 0) {
          const matchingFiles: { file: any; originalIndex: number }[] = [];
          anime.files.forEach((file: any, idx: number) => {
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
            await this.sendSingleFile(ctx, matchingFiles[0].file, anime.name);
            return;
          } else if (matchingFiles.length > 1) {
            matchingFiles.sort((a, b) => {
              const sizeA = parseFloat(a.file.size) || 0;
              const sizeB = parseFloat(b.file.size) || 0;
              return sizeA - sizeB;
            });

            if (anime.poster?.chatId && anime.poster?.messageId) {
              const posterMsg = await ctx.telegram.copyMessage(
                ctx.chat.id,
                anime.poster.chatId,
                anime.poster.messageId,
              );
              await this.saveTempMessage(
                ctx.chat.id,
                posterMsg.message_id,
                this.fileTtlMs,
              );
            }

            const buttons: any[] = [];
            matchingFiles.forEach(({ file, originalIndex }) => {
              const res =
                file.quality ||
                extractResolution('', file.fileName) ||
                'HD';
              const size = file.size || '';
              let audios: string[] = [];
              if (Array.isArray(file.audio) && file.audio.length > 0) {
                audios = file.audio;
              } else if (typeof file.audio === 'string' && file.audio.trim()) {
                audios = [file.audio.trim()];
              } else {
                audios = extractAudioList(file.fileName || '');
              }
              const audioStr =
                audios.length > 0
                  ? audios.join(' + ')
                  : anime.audio && anime.audio.length > 0
                    ? Array.isArray(anime.audio)
                      ? anime.audio.join(' + ')
                      : anime.audio
                    : '';

              const parts: string[] = [];
              if (res) parts.push(`[${res}]`);
              if (size) parts.push(`[${size}]`);
              if (audioStr) parts.push(`[${audioStr}]`);

              const btnText = parts.join(' - ');
              buttons.push([
                {
                  text: btnText,
                  callback_data: `anime_file_${anime._id}_${originalIndex}`,
                },
              ]);
            });

            const caption = `🎬 <b>${this.escapeHtml(anime.name)}</b>\n📍 <b>${targetQual.toUpperCase()}</b> — <i>Select File:</i>`;
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
          }
        }
        if (anime) {
          if (anime.poster?.chatId && anime.poster?.messageId) {
            const posterMsg = await ctx.telegram.copyMessage(
              ctx.chat.id,
              anime.poster.chatId,
              anime.poster.messageId,
            );
            await this.saveTempMessage(
              ctx.chat.id,
              posterMsg.message_id,
              this.fileTtlMs,
            );
          }
          return this.sendEpisodePage(ctx, anime, 0);
        }
      }

      // ── Format 0.4: Direct tab payload (tab:<animeId>:<tabName>:<quality> or tab_<animeId>_<tabName>_<quality>) ──
      if (searchText.startsWith('tab:') || searchText.startsWith('tab_')) {
        await ctx.deleteMessage(ani.message_id);
        const separator = searchText.startsWith('tab:') ? ':' : '_';
        const parts = searchText.split(separator);
        const animeId = parts[1];
        const tabName = parts[2] || 'all';
        const qual = parts[3] || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (anime && anime.files && anime.files.length > 0) {
          if (anime.poster?.chatId && anime.poster?.messageId) {
            const posterMsg = await ctx.telegram.copyMessage(
              ctx.chat.id,
              anime.poster.chatId,
              anime.poster.messageId,
            );
            await this.saveTempMessage(
              ctx.chat.id,
              posterMsg.message_id,
              this.fileTtlMs,
            );
          }
          return this.sendEpisodePage(ctx, anime, 0, tabName, qual);
        }
      }

      // ── Format 0.5: Direct all files / Episode page payload (all:<animeId> or all_<animeId>) ──
      if (searchText.startsWith('all:') || searchText.startsWith('all_')) {
        await ctx.deleteMessage(ani.message_id);
        const separator = searchText.startsWith('all:') ? ':' : '_';
        const animeId = searchText.split(separator)[1];
        const anime = await this.animeModel.findById(animeId);
        if (anime && anime.files && anime.files.length > 0) {
          if (anime.poster?.chatId && anime.poster?.messageId) {
            const posterMsg = await ctx.telegram.copyMessage(
              ctx.chat.id,
              anime.poster.chatId,
              anime.poster.messageId,
            );
            await this.saveTempMessage(
              ctx.chat.id,
              posterMsg.message_id,
              this.fileTtlMs,
            );
          }
          return this.sendEpisodePage(ctx, anime, 0);
        }
      }

      // ── Format 1: id-based payload ──
      if (searchText.startsWith('id:') || searchText.startsWith('id_')) {
        await ctx.deleteMessage(ani.message_id);
        const docId = searchText.slice(3).trim();
        const anime = await this.animeModel.findById(docId);
        if (anime) {
          if (anime.poster?.chatId && anime.poster?.messageId) {
            const posterMsg = await ctx.telegram.copyMessage(
              ctx.chat.id, anime.poster.chatId, anime.poster.messageId,
            );
            await this.saveTempMessage(ctx.chat.id, posterMsg.message_id, this.fileTtlMs);
          }
          return this.sendEpisodePage(ctx, anime, 0);
        }
      }

      const candidates = await this.animeModel.find({
        name: { $regex: this.escapeRegex(searchText), $options: 'i' },
      });

      if (candidates.length === 0) {
        await ctx.deleteMessage(ani.message_id);
        const msg = await ctx.reply(
          `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Anime is not Available in My Database.</b>\n\n<b>Anime Name Must be in Correct Format</b>\n\n <b><u>Examples for Typing</u></b>\n 1.(Anime Name) S01 or (Anime Name) S02 \n2. (Anime Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Anime Available in our bot Using <b> List of Animes</b> </i> \n\n <i>If the Anime is not in the List. Kindly Contact the Admin Using <b>Request Anime</b></i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Request Anime', url: this.supportGroupUrl },
                  { text: 'List of Animes', callback_data: 'list' },
                ],
              ],
            },
          },
        );
        await this.saveTempMessage(ctx.chat.id, msg.message_id, this.fileTtlMs, ctx.from.id);
        return;
      }

      // 🔥 Fuzzy match over the regex-filtered candidates
      let bestMatch: Anime | null = null;
      let bestScore = 0;

      for (const anime of candidates) {
        const score = ratio(searchText.toLowerCase(), anime.name.toLowerCase());
        if (score > bestScore) { bestScore = score; bestMatch = anime; }
      }

      console.log('BEST MATCH:', bestMatch?.name, bestScore);

      if (bestMatch && bestScore >= this.fuzzyMinScore) {
        await ctx.deleteMessage(ani.message_id);
        if (bestMatch.poster?.chatId && bestMatch.poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id, bestMatch.poster.chatId, bestMatch.poster.messageId,
          );
          await this.saveTempMessage(ctx.chat.id, posterMsg.message_id, this.fileTtlMs);
        }
        return this.sendEpisodePage(ctx, bestMatch, 0);
      }

      // ❌ No confident match — fall back to showing all candidates
      await ctx.deleteMessage(ani.message_id);
      const msg = await ctx.reply(
        `<i>Hello ${ctx.from.first_name}</i>\n\n<b>🚫 Requested Anime is not Available in My Database.</b>\n\n<b>Anime Name Must be in Correct Format</b>\n\n<b><u>Examples for Typing</u></b>\n 1.(Web Series Name) S01 or (Web Series Name) S02 \n2. (Anime Name) \n3. (Web Series Name)\n\n<b>Note :</b>\n\n<i>Please Check the Spelling or Anime Available in our bot Using <b> List of Animes</b> </i> \n\n <i>If the Anime is not in the List. Kindly Contact the Admin Using <b>Request Anime</b></i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Request Anime', url: this.supportGroupUrl },
                { text: 'List of Animes', callback_data: 'list' },
              ],
            ],
          },
        },
      );
      await this.saveTempMessage(msg.chat.id, msg.message_id, this.fileTtlMs);
    } catch (err) {
      console.error('Anime search error:', err.message);
      try { await ctx.deleteMessage(ani.message_id); } catch { /* ignore */ }
    }
  }

  // ════════════════════════════════════════════
  //  Admin commands
  // ════════════════════════════════════════════

  async broadcast(ctx: any) {
    try {
      console.log('Broadcast command called');
      if (!this.checkOwner(ctx)) return;
      const text = ctx.message.text.split(' ').slice(1).join(' ');
      if (!text) return ctx.reply('⚠️ Please provide a message.');
      await this.sendBroadcast(text);
      await ctx.reply('✅ Broadcast sent!');
    } catch (err) {
      console.error('Broadcast command error:', err.message);
    }
  }

  async deleteAnimeInDB(ctx: any) {
    try {
      if (!this.checkOwner(ctx)) return;
      const input = ctx.message.text.split(' ').slice(1).join(' ').trim();
      if (!input) {
        return ctx.reply(
          '⚠️ <b>Please provide an Anime Name or MongoDB ID to delete:</b>\n\n' +
            '<code>/da Naruto</code> or <code>/da 6aa56ed6a639e988fc997ffd</code>',
          { parse_mode: 'HTML' },
        );
      }

      // 1. Direct ID match
      if (/^[0-9a-fA-F]{24}$/.test(input)) {
        const doc = await this.animeModel.findById(input);
        if (doc) {
          return this.sendDeleteConfirmation(ctx, doc);
        }
      }

      // 2. Search anime by regex
      const matches = await this.animeModel.find({
        name: { $regex: this.escapeRegex(input), $options: 'i' },
      });

      if (matches.length === 0) {
        return ctx.reply(
          `<b>🚫 No Animes found matching:</b> "<code>${this.escapeHtml(input)}</code>"`,
          { parse_mode: 'HTML' },
        );
      }

      if (matches.length === 1) {
        return this.sendDeleteConfirmation(ctx, matches[0]);
      }

      // Multiple matches
      let msg = `<b>🗑️ <u>Multiple Animes Found (${matches.length})</u></b>\n\n`;
      msg += `<i>Select which anime you want to delete:</i>\n\n`;

      const buttons: any[] = [];
      matches.forEach((doc) => {
        const season = doc.season ? ` • ${doc.season}` : '';
        const filesCount = doc.files ? ` • ${doc.files.length} Files` : '';
        const btnText = `🎌 ${doc.name}${season}${filesCount}`;

        buttons.push([
          {
            text: btnText.length > 55 ? btnText.slice(0, 52) + '...' : btnText,
            callback_data: `da_view_${doc._id}`,
          },
        ]);
      });

      buttons.push([{ text: '❌ Cancel', callback_data: 'da_cancel' }]);

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err: any) {
      console.error('deleteAnimeInDB error:', err.message);
    }
  }

  private async sendDeleteConfirmation(ctx: any, doc: any, isEdit = false) {
    const season = doc.season ? `${doc.season}` : 'N/A';
    const quality = doc.quality || 'N/A';
    const fileCount = doc.files?.length || 0;

    let caption = `<b>⚠️ <u>CONFIRM ANIME DELETION</u></b>\n\n`;
    caption += `🎌 <b>Title :</b> <code>${this.escapeHtml(doc.name)}</code>\n`;
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
          callback_data: `da_del_${doc._id}`,
        },
      ],
      [{ text: '❌ Cancel', callback_data: 'da_cancel' }],
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

  private async handleDeleteAnimeCallback(ctx: any) {
    try {
      await ctx.answerCbQuery();
      if (!this.checkOwner(ctx)) return;

      const data: string = ctx.callbackQuery.data;

      if (data === 'da_cancel' || data === 'dm_cancel') {
        await ctx.editMessageText('<b>❌ Deletion cancelled.</b>', {
          parse_mode: 'HTML',
        });
        return;
      }

      if (data.startsWith('da_view_') || data.startsWith('dm_view_')) {
        const parts = data.split('_');
        const docId = parts[2] || parts[3];
        const doc = await this.animeModel.findById(docId);
        if (!doc) {
          return ctx.editMessageText('<b>⚠️ Anime not found in Database.</b>', {
            parse_mode: 'HTML',
          });
        }
        return this.sendDeleteConfirmation(ctx, doc, true);
      }

      if (data.startsWith('da_del_') || data.startsWith('dm_del_')) {
        const parts = data.split('_');
        const docId = parts[2] || parts[3];
        const doc = await this.animeModel.findById(docId);
        if (!doc) {
          return ctx.editMessageText(
            '<b>⚠️ Anime already deleted or not found.</b>',
            {
              parse_mode: 'HTML',
            },
          );
        }
        const docName = doc.name;
        await this.animeModel.findByIdAndDelete(docId);

        await ctx.editMessageText(
          `<b>🗑️ Successfully Deleted!</b>\n\n` +
            `🎌 <b>${this.escapeHtml(docName)}</b> (<code>${docId}</code>) has been permanently removed from the Database.`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (err: any) {
      console.error('handleDeleteAnimeCallback error:', err.message);
    }
  }

  async help(ctx: any) {
    try {
      const msg = await ctx.reply(
        '<u> <b>Available Commands</b> </u>\n\n👉🏻 1. /list -Use this command to see all available animes.\n\n👉🏻 2. /help - To view the commands available in this bot \n\n✨ Just type the anime name to get anime instantly!\n\n <i><b>Note :</b> if you know the anime name then type the anime name corretly and get anime files</i> \n\n<i>if you don\'t know the exact moive name follow the steps below</i>\n\n<u>Follow the Steps to Get the Anime File</u>\n\n<b>Step - 1 :</b> Use /list Command to get the anime list.\n\n<b>Step - 2 :</b> If the anime Available in the list <b>Press the anime Name It Will Be Copied</b> \n\n<b>Step - 3 :</b> Paste and Send the anime You Will Get the Files \n\n<b>Step - 4 :</b> After Getting the File Forward to Your Friends or In Your Saved Message.\n\n <b> Because Files Will Be Deleted After 5 Mins. For Copyrights Issues</b> \n\n\n <i><b>Thanks For Using Our Bot....❤️</b></i>',
        { parse_mode: 'HTML' },
      );
      await this.saveTempMessage(ctx.chat.id, msg.message_id, this.defaultTtlMs, ctx.from.id);
    } catch (err) {
      console.error('Help command error:', err.message);
    }
  }

  async about(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const msg = await ctx.editMessageCaption(
        `<b>🤖 My Name </b>: <a href="https://t.me/${this.animeBotUsername}">Anime Bot</a> ⚡️\n<b>📝 Language </b>: <a href="https://nestjs.com/">Nest JS</a>\n<b>🚀 Server </b>: <a href="https://vercel.com/">Vercel</a> \n<b>📢 Channel </b>: <a href="${this.promoChannelUrl}">Lord Fourth Movie Tamil</a>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'backToStart' }]] },
        },
      );
      await this.saveTempMessage(ctx.chat.id, msg.message_id, this.defaultTtlMs, ctx.from.id);
    } catch (err) {
      console.error('About command error:', err.message);
    }
  }

  async backToStart(ctx: any) {
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
                { text: '⚙️ Support', url: this.supportGroupUrl },
              ],
              [{ text: 'Developer', url: this.developerUrl }],
            ],
          },
        },
      );
    } catch (err) {
      console.error('Back to start error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Broadcast
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
          console.error(`❌ Could not send to ${user.telegramId}:`, err.message);
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

  // ════════════════════════════════════════════
  //  Episode selection callbacks
  // ════════════════════════════════════════════

  async handleEpisodeSelection(ctx: any) {
    try {
      await ctx.answerCbQuery();
      const data: string = ctx.callbackQuery.data;

      if (data.startsWith('tab_')) {
        const [, animeId, tab] = data.split('_');
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendEpisodePage(ctx, anime, 0, tab, 'all');
      }

      if (data.startsWith('qfilter_')) {
        const parts = data.split('_');
        const animeId = parts[1];
        const tab = parts[2] || 'all';
        const qual = parts.slice(3).join('_') || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendEpisodePage(ctx, anime, 0, tab, qual);
      }

      if (data.startsWith('page_')) {
        const parts = data.split('_');
        const animeId = parts[1];
        const pageStr = parts[2];
        const tab = parts[3] || 'all';
        const qual = parts.slice(4).join('_') || 'all';
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendEpisodePage(
          ctx,
          anime,
          parseInt(pageStr, 10),
          tab,
          qual,
        );
      }

      if (data.startsWith('all_')) {
        const parts = data.split('_');
        const animeId = parts[1];
        const tab = parts[2] || 'all';
        const qual = parts.slice(3).join('_') || 'all';
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

        await this.sendAllFiles(ctx, filesToSend, anime.name);
        return;
      }

      if (data.startsWith('file_')) {
        const [, animeId, idxStr] = data.split('_');
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        const file = anime.files[parseInt(idxStr, 10)];
        if (!file) return ctx.reply('❌ Episode not found.');

        const msg = await ctx.telegram.copyMessage(
          ctx.chat.id,
          file.chatId,
          file.messageId,
        );
        await this.saveTempMessage(
          ctx.chat.id,
          msg.message_id,
          this.fileTtlMs,
          ctx.from.id,
        );

        const successMsg = await ctx.reply(
          `✅ <b>Anime "${anime.name}" sent successfully!</b>\n\n 🙇🏻<b>"Episode orders are not proper, please check Sorry for the inconvenience "</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
          { parse_mode: 'HTML' },
        );
        await this.saveTempMessage(
          ctx.chat.id,
          successMsg.message_id,
          this.fileTtlMs,
          ctx.from.id,
        );
        return;
      }
    } catch (err: any) {
      console.error('Error sending episode:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Episode page renderer
  // ════════════════════════════════════════════

  private async sendEpisodePage(
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
          callback_data: `tab_${anime._id}_all`,
        });
        tabRow.push({
          text: activeTab === 'single' ? '✅ Single Files' : '📁 Single Files',
          callback_data: `tab_${anime._id}_single`,
        });
        tabRow.push({
          text: activeTab === 'sep' ? '✅ Separate' : '🎬 Separate',
          callback_data: `tab_${anime._id}_sep`,
        });
        buttons.push(tabRow);
      }

      // Row 2: Quality Filter Buttons (if multiple qualities exist)
      if (distinctQualities.length > 1) {
        const filterRow: any[] = [];
        filterRow.push({
          text: activeQual === 'all' ? '✅ All Quals' : '🌟 All',
          callback_data: `qfilter_${anime._id}_${activeTab}_all`,
        });
        distinctQualities.forEach((q) => {
          const isSel = q.toLowerCase() === activeQual;
          filterRow.push({
            text: isSel ? `✅ ${q}` : q,
            callback_data: `qfilter_${anime._id}_${activeTab}_${q}`,
          });
        });
        buttons.push(filterRow);
      }

      // Check if this document represents a series or episodic content
      const isSeriesDoc = Boolean(
        anime.season ||
          /S\d{1,2}/i.test(anime.name) ||
          /Season\s*\d+/i.test(anime.name) ||
          anime.files.some((f: any) => {
            const ep = f.episode || extractEpisode('', f.fileName);
            return (
              Boolean(ep) ||
              Boolean(f.season) ||
              isEpisodeRange(f.fileName)
            );
          }),
      );

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
          callback_data: `all_${anime._id}_${activeTab}_${activeQual}`,
        },
      ]);

      // Row 4..N: File / Episode / Pack Buttons
      pageFiles.forEach(({ file, originalIndex }) => {
        const res =
          file.quality ||
          extractResolution('', file.fileName) ||
          'HD';
        const size = file.size || '';

        let audios: string[] = [];
        if (Array.isArray(file.audio) && file.audio.length > 0) {
          audios = file.audio;
        } else if (typeof file.audio === 'string' && file.audio.trim()) {
          audios = [file.audio.trim()];
        } else {
          audios = extractAudioList(file.fileName || '');
        }
        const audioStr =
          audios.length > 0
            ? audios.join(' + ')
            : anime.audio && anime.audio.length > 0
              ? Array.isArray(anime.audio)
                ? anime.audio.join(' + ')
                : anime.audio
              : '';

        let btnText: string;
        if (!isSeriesDoc) {
          // Standalone Movie: Quality - Size - [Audio]
          const parts: string[] = [`❖ ${res}`];
          if (size) parts.push(size);
          if (audioStr) parts.push(`[${audioStr}]`);
          btnText = parts.join(' - ');
        } else {
          // Series / Episodic: Episode - Quality - Size - [Audio]
          const ep = file.episode || extractEpisode('', file.fileName);
          const epLabel = ep
            ? formatEpisodeDisplayName(ep)
            : isEpisodeRange(file.fileName)
              ? 'Batch Pack'
              : 'Episode';
          const parts: string[] = [`❖ ${epLabel}`];
          if (res && (activeQual === 'all' || activeTab === 'all'))
            parts.push(res);
          if (size) parts.push(size);
          if (audioStr) parts.push(`[${audioStr}]`);
          btnText = parts.join(' - ');
        }

        buttons.push([
          {
            text: btnText,
            callback_data: `file_${anime._id}_${originalIndex}`,
          },
        ]);
      });

      // Bottom Row: Pagination Navigation
      const nav: any[] = [];
      if (validPage > 0) {
        nav.push({
          text: '◀️ Prev',
          callback_data: `page_${anime._id}_${validPage - 1}_${activeTab}_${activeQual}`,
        });
      }
      nav.push({
        text: `Page ${validPage + 1}/${totalPages}`,
        callback_data: 'noop',
      });
      if (end < totalFiles) {
        nav.push({
          text: 'Next ▶️',
          callback_data: `page_${anime._id}_${validPage + 1}_${activeTab}_${activeQual}`,
        });
      }
      buttons.push(nav);

      let headerSub = '';
      if (activeTab === 'single') headerSub = ' (Single Files / Packs)';
      else if (activeTab === 'sep') headerSub = ' (Separate Episodes)';
      if (activeQual !== 'all') headerSub += ` [${selectedQuality}]`;

      const caption = `🎬 <b>${this.escapeHtml(anime.name)}${headerSub}</b>\n<i>Select to download:</i>`;

      if (ctx.updateType === 'callback_query') {
        try {
          await ctx.editMessageText(caption, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          });
        } catch (editErr: any) {
          try {
            await ctx.editMessageCaption(caption, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons },
            });
          } catch (captionErr) {
            // ignore if content is identical
          }
        }
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
    } catch (err: any) {
      console.error('sendEpisodePage error:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Reaction helper
  // ════════════════════════════════════════════

  async reactMessage(ctx: any) {
    try {
      const chatId = ctx.chat.id;
      const messageId = ctx.message.message_id;
      const emojis = ['👍','👎','❤️','🔥','🎉','🤩','😱','😁','😢','💩','🤮','🥰','🤯','🤔','🤬','👏'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      await ctx.telegram.setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji: randomEmoji }], { is_big: true });
      console.log(`Reacted with ${randomEmoji} to message ${messageId}`);
    } catch (err) {
      console.error('Error reacting:', err);
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
              `copyMessage failed in anime, trying fileId fallback: ${copyErr.message}`,
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
        console.error('sendAllFiles anime file error:', err.message);
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
            `copyMessage failed in anime, trying fileId fallback: ${copyErr.message}`,
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
      console.error('sendSingleFile anime error:', err.message);
    }
  }

  private async replyFilesSent(ctx: any, name: string) {
    const successMsg = await ctx.reply(
      `✅ <b>Anime "${name}" sent successfully!</b>\n\n` +
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
      botType: 'anime',
    });
  }

  escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeRegex(text: string): string {
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
    /(?:🔈|🔉|🔊|🎙️)?\s*(?:Audio|Language)\s*:\s*(.+)/i,
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