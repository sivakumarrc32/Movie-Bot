import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Setting, ChannelInfo } from '../movie-bot/settings.schema';

export type AdminSession = {
  action: string;
  field?: string;
  extra?: any;
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private cachedSettings: Setting | null = null;
  private adminSessions: Map<number, AdminSession> = new Map();

  private readonly defaultMovieChannels: ChannelInfo[] = [
    { id: '-1003261050452', text: '📢 Join Channel 1', url: 'https://t.me/LFT_Movie' },
    { id: '-1003326848627', text: '📢 Join Channel 2', url: 'https://t.me/+Ekzqobyp6GY4OGE9' },
    { id: '-1003847082548', text: '📢 Join Channel 3', url: 'https://t.me/+5It5cJtwFgU4NTM1' },
    { id: '-1003579412645', text: 'Main Channel', url: 'https://t.me/+eowduZXbyy40NmZl' },
  ];

  private readonly defaultAnimeChannels: ChannelInfo[] = [
    { id: '-1003678273771', text: '📢 Join Channel 1', url: 'https://t.me/+ZsEU6M0ISTBmZTNl' },
    { id: '-1003326848627', text: '📢 Join Channel 2', url: 'https://t.me/+Ekzqobyp6GY4OGE9' },
    { id: '-1003579412645', text: '📢 Join Channel 3', url: 'https://t.me/+YfFvZ_QPOqBiYzE1' },
    { id: '-1003624602414', text: 'Main Channel', url: 'https://t.me/LFT_Movie' },
  ];

  constructor(
    @InjectModel(Setting.name) private settingModel: Model<Setting>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadSettings();
  }

  /**
   * Load or initialize settings from MongoDB, falling back to ConfigService (.env)
   */
  async loadSettings(): Promise<Setting> {
    let setting = await this.settingModel.findOne();
    if (!setting) {
      setting = await this.settingModel.create({
        movieBotUsername: this.configService.get('MOVIE_BOT_USERNAME') || 'lord_fourth_movie6_bot',
        animeBotUsername: this.configService.get('ANIME_BOT_USERNAME') || 'lord_fourth_anime_bot',
        movieForceSubChannels: this.defaultMovieChannels,
        animeForceSubChannels: this.defaultAnimeChannels,
        movieStartGifId: this.configService.get('MOVIE_BOT_START_GIF_ID') || '',
        animeStartGifId: this.configService.get('ANIME_BOT_START_GIF_ID') || '',
        animeLoadingStickerId: this.configService.get('ANIME_BOT_LOADING_STICKER_ID') || '',
        supportGroupUrl: this.configService.get('SUPPORT_GROUP_URL') || 'https://t.me/+JH-KR5ZMJUQyNzI1',
        developerUrl: this.configService.get('DEVELOPER_TELEGRAM_URL') || 'https://t.me/Lord_Fourth04',
        promoChannelUrl: this.configService.get('PROMO_CHANNEL_URL') || 'https://t.me/LFT_Movie',
        movieListChannelId: this.configService.get('MOVIE_LIST_CHANNEL_ID') || '-1002931727367',
        searchGroupUrl: this.configService.get('SEARCH_GROUP_URL') || 'https://t.me/+YQ8qmJcnOyI5Mzhl',
        searchGroupText: this.configService.get('SEARCH_GROUP_TEXT') || 'Join Group and Get Files',
        searchGroupId: this.configService.get('SEARCH_GROUP_ID') || '-1003808933644',
        autoDeleteFileTtlMs: Number(this.configService.get('AUTO_DELETE_FILE_MESSAGE_TIMEOUT_MS')) || 300000,
        autoDeleteNormalTtlMs: Number(this.configService.get('AUTO_DELETE_NORMAL_MESSAGE_TIMEOUT_MS')) || 120000,
        filesPerPage: Number(this.configService.get('FILES_PER_PAGE')) || 10,
        moviesPerListPage: Number(this.configService.get('MOVIES_PER_LIST_PAGE')) || 15,
        pickerPageSize: Number(this.configService.get('SEARCH_RESULTS_PER_PICKER_PAGE')) || 5,
        fuzzyMinScore: Number(this.configService.get('FUZZY_SEARCH_MIN_SCORE')) || 90,
      });
    } else {
      let needsSave = false;
      if (!setting.movieForceSubChannels || setting.movieForceSubChannels.length === 0) {
        setting.movieForceSubChannels = this.defaultMovieChannels;
        needsSave = true;
      }
      if (!setting.animeForceSubChannels || setting.animeForceSubChannels.length === 0) {
        setting.animeForceSubChannels = this.defaultAnimeChannels;
        needsSave = true;
      }
      if (!setting.searchGroupUrl) {
        setting.searchGroupUrl = 'https://t.me/+YQ8qmJcnOyI5Mzhl';
        needsSave = true;
      }
      if (!setting.searchGroupText) {
        setting.searchGroupText = 'Join Group and Get Files';
        needsSave = true;
      }
      if (!setting.searchGroupId) {
        setting.searchGroupId = '-1003808933644';
        needsSave = true;
      }
      if (needsSave) {
        await setting.save();
      }
    }

    this.cachedSettings = setting;
    return setting;
  }

  /** Get the current cached setting document (or reload if null) */
  private async getDoc(): Promise<Setting> {
    if (!this.cachedSettings) {
      await this.loadSettings();
    }
    return this.cachedSettings!;
  }

  // ════════════════════════════════════════════
  //  Live Configuration Getters
  // ════════════════════════════════════════════

  public get ownerId(): number {
    const raw = String(this.configService.get('BOT_OWNER_TELEGRAM_ID') || '');
    const first = raw.split(',')[0]?.trim();
    return Number(first) || 992923409;
  }

  public isOwner(userId?: number): boolean {
    if (!userId) return false;
    const rawBotOwner = String(this.configService.get('BOT_OWNER_TELEGRAM_ID') || '');
    const rawOwnerIds = String(this.configService.get('OWNER_IDS') || '');
    const allOwners = `${rawBotOwner},${rawOwnerIds}`
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Boolean(id) && !isNaN(id));
    if (allOwners.length === 0) {
      allOwners.push(992923409);
    }
    return allOwners.includes(Number(userId));
  }

  public get movieForceSubChannels(): ChannelInfo[] {
    return this.cachedSettings?.movieForceSubChannels || [];
  }

  public get animeForceSubChannels(): ChannelInfo[] {
    return this.cachedSettings?.animeForceSubChannels || [];
  }

  public get movieStartGifId(): string {
    return this.cachedSettings?.movieStartGifId || '';
  }

  public get animeStartGifId(): string {
    return this.cachedSettings?.animeStartGifId || '';
  }

  public get animeLoadingStickerId(): string {
    return this.cachedSettings?.animeLoadingStickerId || '';
  }

  public get movieBotUsername(): string {
    return this.cachedSettings?.movieBotUsername || this.configService.get('MOVIE_BOT_USERNAME') || 'lord_fourth_movie6_bot';
  }

  public get animeBotUsername(): string {
    return this.cachedSettings?.animeBotUsername || this.configService.get('ANIME_BOT_USERNAME') || 'lord_fourth_anime_bot';
  }

  public get supportGroupUrl(): string {
    return this.cachedSettings?.supportGroupUrl || 'https://t.me/+JH-KR5ZMJUQyNzI1';
  }

  public get developerUrl(): string {
    return this.cachedSettings?.developerUrl || 'https://t.me/Lord_Fourth04';
  }

  public get promoChannelUrl(): string {
    return this.cachedSettings?.promoChannelUrl || 'https://t.me/LFT_Movie';
  }

  public get movieListChannelId(): string {
    return this.cachedSettings?.movieListChannelId || '-1002931727367';
  }

  public get searchGroupUrl(): string {
    return this.cachedSettings?.searchGroupUrl || 'https://t.me/+YQ8qmJcnOyI5Mzhl';
  }

  public get searchGroupText(): string {
    return this.cachedSettings?.searchGroupText || 'Join Group and Get Files';
  }

  public get searchGroupId(): string {
    return this.cachedSettings?.searchGroupId || '-1003808933644';
  }

  public get fileTtlMs(): number {
    return this.cachedSettings?.autoDeleteFileTtlMs ?? 300000;
  }

  public get defaultTtlMs(): number {
    return this.cachedSettings?.autoDeleteNormalTtlMs ?? 120000;
  }

  public get filesPerPage(): number {
    return this.cachedSettings?.filesPerPage ?? 10;
  }

  public get listPageSize(): number {
    return this.cachedSettings?.moviesPerListPage ?? 15;
  }

  public get pickerPageSize(): number {
    return this.cachedSettings?.pickerPageSize ?? 5;
  }

  public get fuzzyMinScore(): number {
    return this.cachedSettings?.fuzzyMinScore ?? 90;
  }

  // ════════════════════════════════════════════
  //  Live Configuration Updates
  // ════════════════════════════════════════════

  async updateSettingField(field: keyof Setting, value: any): Promise<Setting> {
    const doc = await this.getDoc();
    (doc as any)[field] = value;
    await doc.save();
    this.cachedSettings = doc;
    console.log(`⚙️ [SettingsService] Updated "${String(field)}" =`, value);
    return doc;
  }

  // ════════════════════════════════════════════
  //  Interactive Telegram Dashboard UI
  // ════════════════════════════════════════════

  /**
   * Render the Main Settings Dashboard
   */
  async renderMainDashboard(ctx: any, isEdit = false) {
    if (!this.isOwner(ctx.from?.id)) {
      return ctx.reply('🚫 <b>You are not authorized to access Settings.</b>', { parse_mode: 'HTML' });
    }

    const text =
      `⚙️ <b>Live Bot Settings & Control Panel</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>All changes are saved to database and applied immediately without restarting the bot!</i>\n\n` +
      `👉 <b>Select a category below to configure:</b>`;

    const keyboard = [
      [
        { text: '📢 Movie Force-Sub', callback_data: 'sett_cat_movie_chans' },
        { text: '📢 Anime Force-Sub', callback_data: 'sett_cat_anime_chans' },
      ],
      [
        { text: '🎨 Visuals & Media', callback_data: 'sett_cat_visuals' },
        { text: '🤖 Bot Usernames', callback_data: 'sett_cat_usernames' },
      ],
      [
        { text: '🔗 Links & Community', callback_data: 'sett_cat_links' },
        { text: '⏱️ Auto-Delete TTL', callback_data: 'sett_cat_timeouts' },
      ],
      [
        { text: '📄 Pagination & Limits', callback_data: 'sett_cat_limits' },
        { text: '📋 View All Settings', callback_data: 'sett_view_all' },
      ],
      [
        { text: '🔄 Reset Defaults', callback_data: 'sett_confirm_reset' },
        { text: '❌ Close Menu', callback_data: 'sett_close' },
      ],
    ];

    if (isEdit) {
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
      } catch {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
  }

  /**
   * Handle all callback queries starting with `sett_`
   */
  async handleCallbackQuery(ctx: any) {
    if (!this.isOwner(ctx.from?.id)) {
      try { await ctx.answerCbQuery('🚫 Unauthorized', { show_alert: true }); } catch (e) {}
      return;
    }

    const data: string = ctx.callbackQuery?.data || '';
    try { await ctx.answerCbQuery(); } catch (e) {}

    // ── Main Dashboard ──
    if (data === 'sett_main') {
      this.clearSession(ctx.from.id);
      return this.renderMainDashboard(ctx, true);
    }

    // ── Close ──
    if (data === 'sett_close') {
      this.clearSession(ctx.from.id);
      return ctx.deleteMessage().catch(() => {});
    }

    // ── Category: Movie Force-Sub Channels ──
    if (data === 'sett_cat_movie_chans') {
      return this.renderMovieChannelsMenu(ctx);
    }

    // ── Category: Anime Force-Sub Channels ──
    if (data === 'sett_cat_anime_chans') {
      return this.renderAnimeChannelsMenu(ctx);
    }

    // ── Category: Visuals & Media ──
    if (data === 'sett_cat_visuals') {
      return this.renderVisualsMenu(ctx);
    }

    // ── Category: Bot Usernames ──
    if (data === 'sett_cat_usernames') {
      return this.renderUsernamesMenu(ctx);
    }

    // ── Category: Links & Community ──
    if (data === 'sett_cat_links') {
      return this.renderLinksMenu(ctx);
    }

    // ── Category: Timeouts ──
    if (data === 'sett_cat_timeouts') {
      return this.renderTimeoutsMenu(ctx);
    }

    // ── Category: Pagination & Limits ──
    if (data === 'sett_cat_limits') {
      return this.renderLimitsMenu(ctx);
    }

    // ── View All Settings ──
    if (data === 'sett_view_all') {
      return this.renderViewAll(ctx);
    }

    // ── Quick Clear Actions ──
    if (data === 'sett_clear_movie_gif') {
      await this.updateSettingField('movieStartGifId', '');
      return this.renderVisualsMenu(ctx);
    }
    if (data === 'sett_clear_anime_gif') {
      await this.updateSettingField('animeStartGifId', '');
      return this.renderVisualsMenu(ctx);
    }
    if (data === 'sett_clear_anime_sticker') {
      await this.updateSettingField('animeLoadingStickerId', '');
      return this.renderVisualsMenu(ctx);
    }
    if (data === 'sett_clear_movie_chans') {
      await this.updateSettingField('movieForceSubChannels', []);
      return this.renderMovieChannelsMenu(ctx);
    }
    if (data === 'sett_clear_anime_chans') {
      await this.updateSettingField('animeForceSubChannels', []);
      return this.renderAnimeChannelsMenu(ctx);
    }

    // ── Restore Channel Defaults ──
    if (data === 'sett_restore_default_movie_chans') {
      await this.updateSettingField('movieForceSubChannels', this.defaultMovieChannels);
      return this.renderMovieChannelsMenu(ctx);
    }
    if (data === 'sett_restore_default_anime_chans') {
      await this.updateSettingField('animeForceSubChannels', this.defaultAnimeChannels);
      return this.renderAnimeChannelsMenu(ctx);
    }

    // ── Remove Individual Channel Pickers ──
    if (data === 'sett_pick_del_movie_chan') {
      const chans = this.movieForceSubChannels;
      const keyboard = chans.map((c, i) => [
        { text: `❌ ${i + 1}. ${c.text}`, callback_data: `sett_del_movie_${i}` },
      ]);
      keyboard.push([{ text: '🔙 Back', callback_data: 'sett_cat_movie_chans' }]);
      return ctx.editMessageText('👇 <b>Click a channel to remove it:</b>', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    if (data.startsWith('sett_del_movie_')) {
      const idx = parseInt(data.replace('sett_del_movie_', ''), 10);
      const list = [...this.movieForceSubChannels];
      if (!isNaN(idx) && idx >= 0 && idx < list.length) {
        list.splice(idx, 1);
        await this.updateSettingField('movieForceSubChannels', list);
      }
      return this.renderMovieChannelsMenu(ctx);
    }

    if (data === 'sett_pick_del_anime_chan') {
      const chans = this.animeForceSubChannels;
      const keyboard = chans.map((c, i) => [
        { text: `❌ ${i + 1}. ${c.text}`, callback_data: `sett_del_anime_${i}` },
      ]);
      keyboard.push([{ text: '🔙 Back', callback_data: 'sett_cat_anime_chans' }]);
      return ctx.editMessageText('👇 <b>Click a channel to remove it:</b>', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    if (data.startsWith('sett_del_anime_')) {
      const idx = parseInt(data.replace('sett_del_anime_', ''), 10);
      const list = [...this.animeForceSubChannels];
      if (!isNaN(idx) && idx >= 0 && idx < list.length) {
        list.splice(idx, 1);
        await this.updateSettingField('animeForceSubChannels', list);
      }
      return this.renderAnimeChannelsMenu(ctx);
    }

    // ── Interactive Prompts (Setting State) ──
    if (data.startsWith('sett_prompt_')) {
      return this.startEditingSession(ctx, data);
    }

    // ── Reset to Defaults Confirmation ──
    if (data === 'sett_confirm_reset') {
      const text =
        `⚠️ <b>Reset Live Settings to Defaults?</b>\n\n` +
        `This will restore default channel lists, timeouts, and pagination settings.`;
      const keyboard = [
        [
          { text: '✅ Yes, Reset All', callback_data: 'sett_do_reset' },
          { text: '❌ No, Cancel', callback_data: 'sett_main' },
        ],
      ];
      return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }

    if (data === 'sett_do_reset') {
      await this.settingModel.deleteMany({});
      this.cachedSettings = null;
      await this.loadSettings();
      return this.renderMainDashboard(ctx, true);
    }
  }

  // ════════════════════════════════════════════
  //  Submenu Renderers
  // ════════════════════════════════════════════

  public async renderMovieChannelsMenu(ctx: any) {
    const chans = this.movieForceSubChannels;
    let text = `📢 <b>Movie Force-Sub Channels (${chans.length})</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (chans.length === 0) {
      text += `<i>No force-sub channels configured (Bypassed).</i>\n\n`;
    } else {
      chans.forEach((c, idx) => {
        text += `<b>${idx + 1}. ${c.text}</b>\n   • ID: <code>${c.id}</code>\n   • URL: ${c.url}\n\n`;
      });
    }
    text += `👇 <i>Choose an action:</i>`;

    const keyboard: any[] = [
      [{ text: '➕ Add Channel', callback_data: 'sett_prompt_add_movie_chan' }],
      [{ text: '🔄 Restore 4 Default Channels', callback_data: 'sett_restore_default_movie_chans' }],
    ];
    if (chans.length > 0) {
      keyboard.push([
        { text: '🗑️ Clear All Channels', callback_data: 'sett_clear_movie_chans' },
        { text: '➖ Remove Channel', callback_data: 'sett_pick_del_movie_chan' },
      ]);
    }
    keyboard.push([{ text: '🔙 Back to Settings', callback_data: 'sett_main' }]);

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderAnimeChannelsMenu(ctx: any) {
    const chans = this.animeForceSubChannels;
    let text = `📢 <b>Anime Force-Sub Channels (${chans.length})</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (chans.length === 0) {
      text += `<i>No force-sub channels configured (Bypassed).</i>\n\n`;
    } else {
      chans.forEach((c, idx) => {
        text += `<b>${idx + 1}. ${c.text}</b>\n   • ID: <code>${c.id}</code>\n   • URL: ${c.url}\n\n`;
      });
    }
    text += `👇 <i>Choose an action:</i>`;

    const keyboard: any[] = [
      [{ text: '➕ Add Channel', callback_data: 'sett_prompt_add_anime_chan' }],
      [{ text: '🔄 Restore 4 Default Channels', callback_data: 'sett_restore_default_anime_chans' }],
    ];
    if (chans.length > 0) {
      keyboard.push([
        { text: '🗑️ Clear All Channels', callback_data: 'sett_clear_anime_chans' },
        { text: '➖ Remove Channel', callback_data: 'sett_pick_del_anime_chan' },
      ]);
    }
    keyboard.push([{ text: '🔙 Back to Settings', callback_data: 'sett_main' }]);

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderVisualsMenu(ctx: any) {
    const text =
      `🎨 <b>Visuals & Media Settings</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Movie Start GIF:</b> <code>${this.movieStartGifId || '(None - Text fallback)'}</code>\n` +
      `• <b>Anime Start GIF:</b> <code>${this.animeStartGifId || '(None - Text fallback)'}</code>\n` +
      `• <b>Anime Loading Sticker:</b> <code>${this.animeLoadingStickerId || '(None)'}</code>\n\n` +
      `👇 <i>Click to update or clear:</i>`;

    const keyboard = [
      [
        { text: '✏️ Edit Movie GIF', callback_data: 'sett_prompt_edit_movie_gif' },
        { text: '🗑️ Clear Movie GIF', callback_data: 'sett_clear_movie_gif' },
      ],
      [
        { text: '✏️ Edit Anime GIF', callback_data: 'sett_prompt_edit_anime_gif' },
        { text: '🗑️ Clear Anime GIF', callback_data: 'sett_clear_anime_gif' },
      ],
      [
        { text: '✏️ Edit Anime Sticker', callback_data: 'sett_prompt_edit_anime_sticker' },
        { text: '🗑️ Clear Sticker', callback_data: 'sett_clear_anime_sticker' },
      ],
      [{ text: '🔙 Back to Settings', callback_data: 'sett_main' }],
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderUsernamesMenu(ctx: any) {
    const text =
      `🤖 <b>Bot Usernames Settings</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Movie Bot:</b> @${this.movieBotUsername}\n` +
      `• <b>Anime Bot:</b> @${this.animeBotUsername}\n\n` +
      `👇 <i>Click to change username handle:</i>`;

    const keyboard = [
      [{ text: '✏️ Edit Movie Bot Username', callback_data: 'sett_prompt_edit_movie_uname' }],
      [{ text: '✏️ Edit Anime Bot Username', callback_data: 'sett_prompt_edit_anime_uname' }],
      [{ text: '🔙 Back to Settings', callback_data: 'sett_main' }],
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderLinksMenu(ctx: any) {
    const text =
      `🔗 <b>Links & Community Settings</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Support Group:</b> ${this.supportGroupUrl}\n` +
      `• <b>Developer URL:</b> ${this.developerUrl}\n` +
      `• <b>Promo Channel:</b> ${this.promoChannelUrl}\n` +
      `• <b>Movie List Channel ID:</b> <code>${this.movieListChannelId}</code>\n` +
      `• <b>Search Group URL:</b> ${this.searchGroupUrl}\n` +
      `• <b>Search Group Text:</b> ${this.searchGroupText}\n` +
      `• <b>Search Group ID:</b> <code>${this.searchGroupId}</code>\n\n` +
      `👇 <i>Click a setting to edit:</i>`;

    const keyboard = [
      [{ text: '✏️ Edit Search Group URL', callback_data: 'sett_prompt_edit_search_grp_url' }],
      [{ text: '✏️ Edit Search Group Text', callback_data: 'sett_prompt_edit_search_grp_text' }],
      [{ text: '✏️ Edit Search Group ID', callback_data: 'sett_prompt_edit_search_grp_id' }],
      [{ text: '✏️ Edit Support Group URL', callback_data: 'sett_prompt_edit_support_url' }],
      [{ text: '✏️ Edit Developer URL', callback_data: 'sett_prompt_edit_dev_url' }],
      [{ text: '✏️ Edit Promo Channel URL', callback_data: 'sett_prompt_edit_promo_url' }],
      [{ text: '✏️ Edit Movie List Channel ID', callback_data: 'sett_prompt_edit_list_chan_id' }],
      [{ text: '🔙 Back to Settings', callback_data: 'sett_main' }],
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderTimeoutsMenu(ctx: any) {
    const text =
      `⏱️ <b>Auto-Delete Timeout Settings</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>File Messages TTL:</b> <code>${this.fileTtlMs} ms</code> (${Math.round(this.fileTtlMs / 60000)} mins)\n` +
      `• <b>Normal Messages TTL:</b> <code>${this.defaultTtlMs} ms</code> (${Math.round(this.defaultTtlMs / 60000)} mins)\n\n` +
      `👇 <i>Click to change duration:</i>`;

    const keyboard = [
      [{ text: '✏️ Edit File Msg TTL (ms)', callback_data: 'sett_prompt_edit_file_ttl' }],
      [{ text: '✏️ Edit Normal Msg TTL (ms)', callback_data: 'sett_prompt_edit_normal_ttl' }],
      [{ text: '🔙 Back to Settings', callback_data: 'sett_main' }],
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderLimitsMenu(ctx: any) {
    const text =
      `📄 <b>Pagination & Limits Settings</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Files Per Page:</b> <code>${this.filesPerPage}</code>\n` +
      `• <b>Movies Per List Page (/list):</b> <code>${this.listPageSize}</code>\n` +
      `• <b>Multiple Results Picker Page:</b> <code>${this.pickerPageSize}</code>\n` +
      `• <b>Fuzzy Search Min Score:</b> <code>${this.fuzzyMinScore}</code>\n\n` +
      `👇 <i>Click to adjust values:</i>`;

    const keyboard = [
      [
        { text: '✏️ Files Per Page', callback_data: 'sett_prompt_edit_files_page' },
        { text: '✏️ List Page Size', callback_data: 'sett_prompt_edit_list_page' },
      ],
      [
        { text: '✏️ Picker Page Size', callback_data: 'sett_prompt_edit_picker_page' },
        { text: '✏️ Fuzzy Search Min Score', callback_data: 'sett_prompt_edit_fuzzy_score' },
      ],
      [{ text: '🔙 Back to Settings', callback_data: 'sett_main' }],
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  public async renderViewAll(ctx: any) {
    const text =
      `📋 <b>Full Live Configuration Summary</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 <b>Bots:</b> @${this.movieBotUsername} | @${this.animeBotUsername}\n` +
      `📢 <b>Movie Channels:</b> ${this.movieForceSubChannels.length} configured\n` +
      `📢 <b>Anime Channels:</b> ${this.animeForceSubChannels.length} configured\n` +
      `🎨 <b>Movie GIF:</b> <code>${this.movieStartGifId ? 'Configured' : 'None'}</code>\n` +
      `🎨 <b>Anime GIF:</b> <code>${this.animeStartGifId ? 'Configured' : 'None'}</code>\n` +
      `⏱️ <b>File TTL:</b> <code>${this.fileTtlMs}ms</code> | <b>Normal TTL:</b> <code>${this.defaultTtlMs}ms</code>\n` +
      `📄 <b>Page Sizes:</b> Files: ${this.filesPerPage}, List: ${this.listPageSize}, Picker: ${this.pickerPageSize}\n` +
      `🔍 <b>Fuzzy Score:</b> <code>${this.fuzzyMinScore}</code>\n` +
      `🔗 <b>Support:</b> ${this.supportGroupUrl}\n` +
      `🔗 <b>Dev:</b> ${this.developerUrl}\n`;

    const keyboard = [[{ text: '🔙 Back to Settings', callback_data: 'sett_main' }]];
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  /**
   * Set up admin session to capture next input from admin
   */
  private async startEditingSession(ctx: any, data: string) {
    const userId = ctx.from.id;
    let promptMsg = '';
    let action = '';

    switch (data) {
      case 'sett_prompt_edit_movie_gif':
        action = 'EDIT_MOVIE_GIF';
        promptMsg = '🎨 <b>Send or forward the new GIF for Movie Bot</b> (or send an HTTPS image/gif URL, or /cancel):';
        break;
      case 'sett_prompt_edit_anime_gif':
        action = 'EDIT_ANIME_GIF';
        promptMsg = '🎨 <b>Send or forward the new GIF for Anime Bot</b> (or send an HTTPS image/gif URL, or /cancel):';
        break;
      case 'sett_prompt_edit_anime_sticker':
        action = 'EDIT_ANIME_STICKER';
        promptMsg = '🎨 <b>Send a Sticker for Anime Bot loading</b> (or send sticker file_id, or /cancel):';
        break;
      case 'sett_prompt_edit_movie_uname':
        action = 'EDIT_MOVIE_UNAME';
        promptMsg = '🤖 <b>Send the new Movie Bot username</b> (without @, e.g. <code>my_movie_bot</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_anime_uname':
        action = 'EDIT_ANIME_UNAME';
        promptMsg = '🤖 <b>Send the new Anime Bot username</b> (without @, e.g. <code>my_anime_bot</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_support_url':
        action = 'EDIT_SUPPORT_URL';
        promptMsg = '🔗 <b>Send the new Support Group Telegram URL</b> (e.g. <code>https://t.me/+JH-...</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_search_grp_url':
        action = 'EDIT_SEARCH_GRP_URL';
        promptMsg = '🔗 <b>Send the new Search Group Telegram URL</b> (e.g. <code>https://t.me/+YQ8qmJcnOyI5Mzhl</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_search_grp_text':
        action = 'EDIT_SEARCH_GRP_TEXT';
        promptMsg = '🔗 <b>Send the button text for the Search Group</b> (e.g. <code>Join Group and Get Files</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_search_grp_id':
        action = 'EDIT_SEARCH_GRP_ID';
        promptMsg = '🔗 <b>Send the Search Group Channel/Group ID</b> (e.g. <code>-1003808933644</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_dev_url':
        action = 'EDIT_DEV_URL';
        promptMsg = '🔗 <b>Send the new Developer Telegram Link</b> (e.g. <code>https://t.me/Lord_Fourth04</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_promo_url':
        action = 'EDIT_PROMO_URL';
        promptMsg = '🔗 <b>Send the new Promo Channel URL</b> (e.g. <code>https://t.me/LFT_Movie</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_list_chan_id':
        action = 'EDIT_LIST_CHAN_ID';
        promptMsg = '🔗 <b>Send the Movie List Channel ID</b> (e.g. <code>-1002931727367</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_file_ttl':
        action = 'EDIT_FILE_TTL';
        promptMsg = '⏱️ <b>Send File Messages TTL in milliseconds</b> (e.g. <code>300000</code> for 5 minutes, or /cancel):';
        break;
      case 'sett_prompt_edit_normal_ttl':
        action = 'EDIT_NORMAL_TTL';
        promptMsg = '⏱️ <b>Send Normal Messages TTL in milliseconds</b> (e.g. <code>120000</code> for 2 minutes, or /cancel):';
        break;
      case 'sett_prompt_edit_files_page':
        action = 'EDIT_FILES_PAGE';
        promptMsg = '📄 <b>Send Files Per Page count</b> (e.g. <code>10</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_list_page':
        action = 'EDIT_LIST_PAGE';
        promptMsg = '📄 <b>Send Movies Per Page count for /list</b> (e.g. <code>15</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_picker_page':
        action = 'EDIT_PICKER_PAGE';
        promptMsg = '📄 <b>Send Multiple Match Picker Page Size</b> (e.g. <code>5</code>, or /cancel):';
        break;
      case 'sett_prompt_edit_fuzzy_score':
        action = 'EDIT_FUZZY_SCORE';
        promptMsg = '🔍 <b>Send Fuzzy Search Min Score (1-100)</b> (e.g. <code>90</code>, or /cancel):';
        break;
      case 'sett_prompt_add_movie_chan':
        action = 'ADD_MOVIE_CHAN';
        promptMsg =
          `➕ <b>Add Movie Force-Sub Channel</b>\n\n` +
          `Send in format: <code>Channel_ID | Button_Text | Channel_Link</code>\n` +
          `<b>Example:</b>\n<code>-1003261050452 | 📢 Join Main Channel | https://t.me/LFT_Movie</code>\n\n` +
          `<i>(or send /cancel)</i>`;
        break;
      case 'sett_prompt_add_anime_chan':
        action = 'ADD_ANIME_CHAN';
        promptMsg =
          `➕ <b>Add Anime Force-Sub Channel</b>\n\n` +
          `Send in format: <code>Channel_ID | Button_Text | Channel_Link</code>\n` +
          `<b>Example:</b>\n<code>-1003678273771 | 📢 Join Anime 1 | https://t.me/+ZsEU...</code>\n\n` +
          `<i>(or send /cancel)</i>`;
        break;
    }

    if (!action) return;

    this.adminSessions.set(userId, { action });

    const keyboard = [[{ text: '❌ Cancel Editing', callback_data: 'sett_main' }]];
    return ctx.editMessageText(promptMsg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  }

  /**
   * Handle incoming message from admin when in an active editing session
   * Returns true if handled, false otherwise
   */
  async handleAdminInput(ctx: any): Promise<boolean> {
    const userId = ctx.from?.id;
    if (!userId || !this.isOwner(userId)) return false;

    const session = this.adminSessions.get(userId);
    if (!session) return false;

    // Handle /cancel command
    if (ctx.message?.text === '/cancel') {
      this.clearSession(userId);
      await ctx.reply('❌ <i>Edit cancelled.</i>', { parse_mode: 'HTML' });
      await this.renderMainDashboard(ctx);
      return true;
    }

    const text: string = ctx.message?.text?.trim() || '';
    const fileId =
      ctx.message?.animation?.file_id ||
      ctx.message?.document?.file_id ||
      ctx.message?.sticker?.file_id ||
      ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id;

    let successMsg = '';

    try {
      switch (session.action) {
        case 'EDIT_MOVIE_GIF': {
          const val = fileId || text;
          if (!val) throw new Error('Please send a valid GIF or image link');
          await this.updateSettingField('movieStartGifId', val);
          successMsg = `✅ <b>Movie Start GIF updated!</b>`;
          break;
        }
        case 'EDIT_ANIME_GIF': {
          const val = fileId || text;
          if (!val) throw new Error('Please send a valid GIF or image link');
          await this.updateSettingField('animeStartGifId', val);
          successMsg = `✅ <b>Anime Start GIF updated!</b>`;
          break;
        }
        case 'EDIT_ANIME_STICKER': {
          const val = fileId || text;
          if (!val) throw new Error('Please send a valid sticker or file ID');
          await this.updateSettingField('animeLoadingStickerId', val);
          successMsg = `✅ <b>Anime Loading Sticker updated!</b>`;
          break;
        }
        case 'EDIT_MOVIE_UNAME': {
          if (!text) throw new Error('Username cannot be empty');
          const clean = text.replace('@', '').trim();
          await this.updateSettingField('movieBotUsername', clean);
          successMsg = `✅ <b>Movie Bot username updated to:</b> @${clean}`;
          break;
        }
        case 'EDIT_ANIME_UNAME': {
          if (!text) throw new Error('Username cannot be empty');
          const clean = text.replace('@', '').trim();
          await this.updateSettingField('animeBotUsername', clean);
          successMsg = `✅ <b>Anime Bot username updated to:</b> @${clean}`;
          break;
        }
        case 'EDIT_SUPPORT_URL': {
          if (!text.startsWith('http')) throw new Error('Please provide a valid URL starting with https://');
          await this.updateSettingField('supportGroupUrl', text);
          successMsg = `✅ <b>Support Group URL updated!</b>`;
          break;
        }
        case 'EDIT_SEARCH_GRP_URL': {
          if (!text.startsWith('http')) throw new Error('Please provide a valid URL starting with https://');
          await this.updateSettingField('searchGroupUrl', text);
          successMsg = `✅ <b>Search Group URL updated!</b>`;
          break;
        }
        case 'EDIT_SEARCH_GRP_TEXT': {
          if (!text) throw new Error('Button text cannot be empty');
          await this.updateSettingField('searchGroupText', text);
          successMsg = `✅ <b>Search Group button text updated to:</b> ${text}`;
          break;
        }
        case 'EDIT_SEARCH_GRP_ID': {
          if (!text) throw new Error('Group ID cannot be empty');
          await this.updateSettingField('searchGroupId', text);
          successMsg = `✅ <b>Search Group ID updated to:</b> <code>${text}</code>`;
          break;
        }
        case 'EDIT_DEV_URL': {
          if (!text.startsWith('http')) throw new Error('Please provide a valid URL starting with https://');
          await this.updateSettingField('developerUrl', text);
          successMsg = `✅ <b>Developer URL updated!</b>`;
          break;
        }
        case 'EDIT_PROMO_URL': {
          if (!text.startsWith('http')) throw new Error('Please provide a valid URL starting with https://');
          await this.updateSettingField('promoChannelUrl', text);
          successMsg = `✅ <b>Promo Channel URL updated!</b>`;
          break;
        }
        case 'EDIT_LIST_CHAN_ID': {
          if (!text) throw new Error('Channel ID cannot be empty');
          await this.updateSettingField('movieListChannelId', text);
          successMsg = `✅ <b>Movie List Channel ID updated to:</b> <code>${text}</code>`;
          break;
        }
        case 'EDIT_FILE_TTL': {
          const num = parseInt(text, 10);
          if (isNaN(num) || num <= 0) throw new Error('Please enter a valid positive number in milliseconds');
          await this.updateSettingField('autoDeleteFileTtlMs', num);
          successMsg = `✅ <b>File Messages TTL updated to:</b> <code>${num} ms</code> (${Math.round(num / 60000)} mins)`;
          break;
        }
        case 'EDIT_NORMAL_TTL': {
          const num = parseInt(text, 10);
          if (isNaN(num) || num <= 0) throw new Error('Please enter a valid positive number in milliseconds');
          await this.updateSettingField('autoDeleteNormalTtlMs', num);
          successMsg = `✅ <b>Normal Messages TTL updated to:</b> <code>${num} ms</code> (${Math.round(num / 60000)} mins)`;
          break;
        }
        case 'EDIT_FILES_PAGE': {
          const num = parseInt(text, 10);
          if (isNaN(num) || num <= 0) throw new Error('Please enter a valid positive integer');
          await this.updateSettingField('filesPerPage', num);
          successMsg = `✅ <b>Files Per Page updated to:</b> <code>${num}</code>`;
          break;
        }
        case 'EDIT_LIST_PAGE': {
          const num = parseInt(text, 10);
          if (isNaN(num) || num <= 0) throw new Error('Please enter a valid positive integer');
          await this.updateSettingField('moviesPerListPage', num);
          successMsg = `✅ <b>Movies Per List Page updated to:</b> <code>${num}</code>`;
          break;
        }
        case 'EDIT_PICKER_PAGE': {
          const num = parseInt(text, 10);
          if (isNaN(num) || num <= 0) throw new Error('Please enter a valid positive integer');
          await this.updateSettingField('pickerPageSize', num);
          successMsg = `✅ <b>Picker Page Size updated to:</b> <code>${num}</code>`;
          break;
        }
        case 'EDIT_FUZZY_SCORE': {
          const num = parseInt(text, 10);
          if (isNaN(num) || num < 1 || num > 100) throw new Error('Please enter a number between 1 and 100');
          await this.updateSettingField('fuzzyMinScore', num);
          successMsg = `✅ <b>Fuzzy Search Min Score updated to:</b> <code>${num}</code>`;
          break;
        }
        case 'ADD_MOVIE_CHAN': {
          const parts = text.split('|').map((p) => p.trim());
          if (parts.length < 3) throw new Error('Invalid format! Use: Channel_ID | Button_Text | Channel_Link');
          const newChan: ChannelInfo = { id: parts[0], text: parts[1], url: parts[2] };
          const list = [...this.movieForceSubChannels, newChan];
          await this.updateSettingField('movieForceSubChannels', list);
          successMsg = `✅ <b>Added Movie Force-Sub Channel:</b> ${newChan.text}`;
          break;
        }
        case 'ADD_ANIME_CHAN': {
          const parts = text.split('|').map((p) => p.trim());
          if (parts.length < 3) throw new Error('Invalid format! Use: Channel_ID | Button_Text | Channel_Link');
          const newChan: ChannelInfo = { id: parts[0], text: parts[1], url: parts[2] };
          const list = [...this.animeForceSubChannels, newChan];
          await this.updateSettingField('animeForceSubChannels', list);
          successMsg = `✅ <b>Added Anime Force-Sub Channel:</b> ${newChan.text}`;
          break;
        }
      }

      this.clearSession(userId);
      const keyboard = [[{ text: '🔙 Back to Settings Dashboard', callback_data: 'sett_main' }]];
      await ctx.reply(successMsg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
      return true;
    } catch (err: any) {
      await ctx.reply(`⚠️ <b>Error:</b> ${err.message}\n\n<i>Try again or send /cancel to exit.</i>`, {
        parse_mode: 'HTML',
      });
      return true;
    }
  }

  private clearSession(userId: number) {
    this.adminSessions.delete(userId);
  }
}
