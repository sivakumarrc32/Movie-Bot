import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChannelInfo = {
  id: string;
  text: string;
  url: string;
};

@Schema({ timestamps: true })
export class Setting extends Document {
  // Bot Usernames
  @Prop({ default: 'lord_fourth_movie6_bot' })
  movieBotUsername: string;

  @Prop({ default: 'lord_fourth_anime_bot' })
  animeBotUsername: string;

  // Legacy fields
  @Prop({ default: '' })
  boturl: string;

  @Prop({ default: '' })
  animeboturl: string;

  // Force-Sub Channels
  @Prop({ type: Array, default: [] })
  movieForceSubChannels: ChannelInfo[];

  @Prop({ type: Array, default: [] })
  animeForceSubChannels: ChannelInfo[];

  // Visuals & Media
  @Prop({ default: '' })
  movieStartGifId: string;

  @Prop({ default: '' })
  animeStartGifId: string;

  @Prop({ default: '' })
  animeLoadingStickerId: string;

  // Community & URLs
  @Prop({ default: 'https://t.me/+JH-KR5ZMJUQyNzI1' })
  supportGroupUrl: string;

  @Prop({ default: 'https://t.me/Lord_Fourth04' })
  developerUrl: string;

  @Prop({ default: 'https://t.me/Lord_Fourth04' })
  developerTelegramUrl: string;

  @Prop({ default: 'https://t.me/LFT_Movie' })
  promoChannelUrl: string;

  @Prop({ default: '-1002931727367' })
  movieListChannelId: string;

  @Prop({ default: 'https://t.me/+YQ8qmJcnOyI5Mzhl' })
  searchGroupUrl: string;

  @Prop({ default: 'Join Group and Get Files' })
  searchGroupText: string;

  @Prop({ default: '-1003808933644' })
  searchGroupId: string;

  // Auto-Delete Timeouts (ms)
  @Prop({ default: 300000 })
  autoDeleteFileTtlMs: number;

  @Prop({ default: 120000 })
  autoDeleteNormalTtlMs: number;

  // Pagination & Search Limits
  @Prop({ default: 10 })
  filesPerPage: number;

  @Prop({ default: 15 })
  moviesPerListPage: number;

  @Prop({ default: 5 })
  pickerPageSize: number;

  @Prop({ default: 90 })
  fuzzyMinScore: number;
}

export const settingSchema = SchemaFactory.createForClass(Setting);
