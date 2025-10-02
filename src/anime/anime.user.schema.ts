import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
// import { Anime } from './anime.schema';

export type AnimeUserDocument = AnimeUser & Document;

@Schema({ timestamps: true })
export class AnimeUser {
  @Prop({ required: true, unique: true })
  telegramId: number;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  username: string;

  @Prop()
  languageCode: string;

  @Prop({ default: false })
  isBot: boolean;
}

export const AnimeUserSchema = SchemaFactory.createForClass(AnimeUser);
