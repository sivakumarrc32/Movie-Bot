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
}

export const MovieSchema = SchemaFactory.createForClass(Movie);
