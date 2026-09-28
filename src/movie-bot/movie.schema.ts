import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Movie extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  caption: string;

  @Prop({ default: null })
  year: number;

  @Prop({ type: [String], default: [] })
  audio: string[];

  @Prop({ default: null })
  quality: string;

  @Prop({ default: null })
  season: string;

  @Prop({
    type: {
      chatId: { type: String },
      messageId: { type: Number },
      fileId: { type: String },
    },
  })
  poster: {
    chatId: string;
    messageId: number;
    fileId: string;
  };

  @Prop({
    type: [
      {
        fileName: { type: String },
        size: { type: String },
        season: { type: String, default: null },
        episode: { type: String, default: null },
        quality: { type: String, default: null },
        audio: { type: [String], default: [] },
        chatId: { type: String },
        messageId: { type: Number },
        fileId: { type: String },
      },
    ],
    default: [],
  })
  files: {
    fileName: string;
    size: string;
    season: string | null;
    episode: string | null;
    quality: string | null;
    audio: string[];
    chatId: string;
    messageId: number;
    fileId: string;
  }[];

  @Prop()
  shortLink: string;

  @Prop({ default: null, index: true })
  tmdb_id: number;

  @Prop({ default: null, type: String })
  tmdb_poster: string | null;

  @Prop({ default: null, type: String })
  tel_poster_url: string | null;

  @Prop({ type: [String], default: [] })
  relatedMovieIds: string[];

  @Prop({ type: Number, default: 0 })
  websiteView: number;

  // ── SUBTITLES (For Both Single Movies & Multi-Episode Series) ──
  @Prop({
    type: [
      {
        season: { type: String, default: null },       // e.g. "1" for Series, null for Movies
        episode: { type: String, default: null },     // e.g. "01", "1" for Series, null for Movies
        lang: { type: String, required: true },       // e.g. "English", "Tamil"
        code: { type: String, default: 'und' },        // e.g. "en", "ta", "te"
        chatId: { type: String, required: true },      // Telegram Channel ID
        messageId: { type: Number, required: true },   // Telegram Message ID
        fileId: { type: String, default: null },       // Telegram File ID
        fileName: { type: String, default: null },     // e.g. "S01E01.English.srt"
        format: { type: String, default: 'srt' },      // "srt" or "vtt"
      },
    ],
    default: [],
  })
  subtitles: {
    season?: string | null;
    episode?: string | null;
    lang: string;
    code: string;
    chatId: string;
    messageId: number;
    fileId?: string | null;
    fileName?: string | null;
    format?: string;
  }[];
}

export const MovieSchema = SchemaFactory.createForClass(Movie);
MovieSchema.index({ updatedAt: -1, _id: -1 });
MovieSchema.index({ name: 1 });
MovieSchema.index({ websiteView: -1, updatedAt: -1 });

