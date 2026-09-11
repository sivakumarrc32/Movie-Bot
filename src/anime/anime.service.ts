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
  ) {
    this.bot = new Telegraf(this.configService.get('ANIME_BOT_TOKEN')!);
  }

  // ─────────────────────────────────────────────
  //  Dynamic Configuration Getters
  // ─────────────────────────────────────────────

  public get ownerId(): number {
    return (
      Number(this.configService.get('BOT_OWNER_TELEGRAM_ID')) || 992923409
    );
  }

  public get channels(): ChannelInfo[] {
    try {
      const raw = this.configService.get<string>(
        'ANIME_BOT_FORCE_SUB_CHANNELS',
      );
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error(
        'Failed to parse ANIME_BOT_FORCE_SUB_CHANNELS from .env:',
        e,
      );
    }
    return [
      {
        id: '-1003678273771',
        text: '📢 Join Channel 1',
        url: 'https://t.me/+ZsEU6M0ISTBmZTNl',
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
        url: 'https://t.me/LFT_Movie',
      },
    ];
  }

  public get pageSize(): number {
    return Number(this.configService.get('FILES_PER_PAGE')) || 10;
  }

  public get listPageSize(): number {
    return Number(this.configService.get('MOVIES_PER_LIST_PAGE')) || 15;
  }

  public get fileTtlMs(): number {
    return (
      Number(this.configService.get('AUTO_DELETE_FILE_MESSAGE_TIMEOUT_MS')) ||
      5 * 60 * 1000
    );
  }

  public get defaultTtlMs(): number {
    return (
      Number(
        this.configService.get('AUTO_DELETE_NORMAL_MESSAGE_TIMEOUT_MS'),
      ) || 2 * 60 * 1000
    );
  }

  public get fuzzyMinScore(): number {
    return Number(this.configService.get('FUZZY_SEARCH_MIN_SCORE')) || 90;
  }

  public get startGifId(): string {
    return (
      this.configService.get<string>('ANIME_BOT_START_GIF_ID') ||
      'CgACAgUAAxkBAAIM6WlhV0ySZvJz7GhO7DNz1IdU6hqgAAIbHQACT_8RV-xe9oQ-2OHMOAQ'
    );
  }

  public get loadingStickerId(): string {
    return (
      this.configService.get<string>('ANIME_BOT_LOADING_STICKER_ID') ||
      'CAACAgUAAxkBAAIBpmje0EtKLDDHmnxLwL1Y8l7HtN0LAAJ9GQACSsz4Vv2odmJpcRPVNgQ'
    );
  }

  public get supportGroupUrl(): string {
    return (
      this.configService.get<string>('SUPPORT_GROUP_URL') ||
      'https://t.me/+JH-KR5ZMJUQyNzI1'
    );
  }

  public get developerUrl(): string {
    return (
      this.configService.get<string>('DEVELOPER_TELEGRAM_URL') ||
      'https://t.me/Lord_Fourth04'
    );
  }

  public get promoChannelUrl(): string {
    return (
      this.configService.get<string>('PROMO_CHANNEL_URL') ||
      'https://t.me/LordFourthMovieTamil'
    );
  }

  public get movieBotUsername(): string {
    return (
      this.configService.get<string>('MOVIE_BOT_USERNAME') ||
      'lord_fourth_movie6_bot'
    );
  }

  public get animeBotUsername(): string {
    return (
      this.configService.get<string>('ANIME_BOT_USERNAME') ||
      'lord_fourth_anime_bot'
    );
  }

  // ════════════════════════════════════════════
  //  Auth helpers
  // ════════════════════════════════════════════

  private checkOwner(ctx: any): boolean {
    if (ctx.from.id !== this.ownerId) {
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
        const member = await ctx.telegram.getChatMember(
          channel.id,
          ctx.from.id,
        );
        if (member.status === 'left' || member.status === 'kicked') {
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

      await ctx.replyWithAnimation(this.startGifId, {
        caption:
          `Hi ${ctx.from.first_name},\n\n` +
          `<b>Intha channel la join pannunga</b>\n\n` +
          `Movies direct-ah channel-la post pannuvom.\n` +
          `Updates miss pannaama irukka join pannunga.\n\n` +
          `👇 Keela irukkura button click pannunga`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
      return false;
    } catch (err) {
      console.error('checkSubscription error:', err.message);
      return false;
    }
  }

  // ════════════════════════════════════════════
  //  Lifecycle
  // ════════════════════════════════════════════

  onModuleInit() {
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
    this.bot.action(/^(all|file|page)_/, (ctx) => this.handleEpisodeSelection(ctx));
    this.bot.action('noop', async (ctx) => { await ctx.answerCbQuery('❌ This Not a Button'); });
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
      const message = await ctx.replyWithAnimation(
        this.startGifId,
        {
          caption:
            `👋 Hi <a href="https://t.me/${userName}">${ctx.from.first_name}</a>\n\n` +
            `<i>I'm your friendly Anime Bot 🤖</i>\n\n` +
            `<b>Here, you can get anime files directly</b> — no link shorteners, no ads, just pure animes! 🍿\n\n` +
            `👉 <b>Send the correct anime name</b>, and if it's available in my database, you'll get the <b>file instantly!</b>\n\n` +
            `⚡<i>Enjoy your anime time! 🎥💫</i>`,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
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
          },
        },
      );

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
    if (ctx.message.text.startsWith('/')) return;

    const ani = await ctx.replyWithAnimation(this.loadingStickerId);

    try {
      const name = ctx.message.text.trim();
      const animes = await this.animeModel.find({ name: { $regex: name, $options: 'i' } });

      if (animes.length === 0) {
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

      if (animes.length === 1) {
        await ctx.deleteMessage(ani.message_id);
        if (animes[0].poster?.chatId && animes[0].poster?.messageId) {
          const posterMsg = await ctx.telegram.copyMessage(
            ctx.chat.id, animes[0].poster.chatId, animes[0].poster.messageId,
          );
          await this.saveTempMessage(ctx.chat.id, posterMsg.message_id, this.fileTtlMs);
        }
        return this.sendEpisodePage(ctx, animes[0], 0);
      }

      // 🔥 Fuzzy match (multiple results)
      let bestMatch: Anime | null = null;
      let bestScore = 0;

      for (const anime of animes) {
        const score = ratio(name.toLowerCase(), anime.name.toLowerCase());
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

      // ❌ No confident match → show list
      await ctx.deleteMessage(ani.message_id);
      let list = '';
      animes.forEach((m) => { list += `• <code>${m.name}</code>\n`; });

      const msg = await ctx.reply(`<b>Multiple Animes found</b>\n\n${list}`, { parse_mode: 'HTML' });
      await this.saveTempMessage(msg.chat.id, msg.message_id, this.fileTtlMs, ctx.from.id);
    } catch (err) {
      console.error('Anime search error:', err.message);
      try { await ctx.deleteMessage(ani.message_id); } catch { /* ignore */ }
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
      const data = ctx.callbackQuery.data as string;

      if (data.startsWith('page_')) {
        console.log('page_', data);
        const parts = data.split('_');
        const animeId = parts[1];
        const page = parseInt(parts[2], 10);
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');
        return this.sendEpisodePage(ctx, anime, page);
      }

      if (data.startsWith('all_')) {
        const animeId = data.split('_')[1];
        const anime = await this.animeModel.findById(animeId);
        if (!anime) return ctx.reply('❌ Anime not found.');

        for (const file of anime.files) {
          const message = await ctx.telegram.copyMessage(ctx.chat.id, file.chatId, file.messageId);
          await this.saveTempMessage(ctx.chat.id, message.message_id, this.fileTtlMs, ctx.from.id);
        }

        const successMsg = await ctx.reply(
          `✅ <b>Anime "${anime.name}" sent successfully!</b>\n\n 🙇🏻<b>"Episode orders are not proper, please check Sorry for the inconvenience "</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
          { parse_mode: 'HTML' },
        );
        await this.saveTempMessage(ctx.chat.id, successMsg.message_id, this.fileTtlMs, ctx.from.id);
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

        const msg = await ctx.telegram.copyMessage(ctx.chat.id, file.chatId, file.messageId);
        await this.saveTempMessage(ctx.chat.id, msg.message_id, this.fileTtlMs, ctx.from.id);

        const successMsg = await ctx.reply(
          `✅ <b>Anime "${anime.name}" sent successfully!</b>\n\n 🙇🏻<b>"Episode orders are not proper, please check Sorry for the inconvenience "</b>\n\n🍿 Enjoy watching. \n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
          { parse_mode: 'HTML' },
        );
        await this.saveTempMessage(ctx.chat.id, successMsg.message_id, this.fileTtlMs, ctx.from.id);
        return;
      }
    } catch (err) {
      console.error('Error sending episode:', err.message);
    }
  }

  // ════════════════════════════════════════════
  //  Episode page renderer
  // ════════════════════════════════════════════

  private async sendEpisodePage(ctx: any, anime: any, page: number) {
    const start = page * this.pageSize;
    const end = start + this.pageSize;
    const reversedFiles = [...anime.files].reverse();
    const files = reversedFiles.slice(start, end);
    const totalPages = Math.ceil(anime.files.length / this.pageSize);

    const buttons: any[] = [];

    if (page === 0) {
      buttons.push([{ text: '📥 Send All', callback_data: `all_${anime._id}` }]);
    }

    files.forEach((file: any, idx: number) => {
      const fileName = file.fileName
        .replace(/^@[^-_]+[-_]*\s*-*\s*/, '')
        .replace(/\.mkv$/i, '');
      const fileSize = file.size || '';
      const originalIndex = anime.files.length - 1 - (start + idx);
      buttons.push([{
        text: `[${fileSize}]-${fileName}`,
        callback_data: `file_${anime._id}_${originalIndex}`,
      }]);
    });

    const navButtons: any[] = [];
    if (page > 0) navButtons.push({ text: '⬅️ Prev', callback_data: `page_${anime._id}_${page - 1}` });
    buttons.push({ text: `Page ${page + 1}/${totalPages}`, callback_data: 'noop' });
    if (end < anime.files.length) {
      console.log('end < anime.files.length', end, anime.files.length);
      navButtons.push({ text: 'Next ➡️', callback_data: `page_${anime._id}_${page + 1}` });
    }
    if (navButtons.length) buttons.push(navButtons);

    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(`<b>${anime.name} Episodes (Page ${page + 1})</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    } else {
      const msg = await ctx.reply(`<b>${anime.name} Episodes (Page ${page + 1})</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
      await this.saveTempMessage(ctx.chat.id, msg.message_id, this.fileTtlMs, ctx.from.id);
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

  // ════════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════════

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

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}