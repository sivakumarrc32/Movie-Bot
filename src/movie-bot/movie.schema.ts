import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Movie extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  caption: string;

  @Prop({ default: null })
  year: number;

  @Prop({
    type: {
      chatId: { type: String },
      messageId: { type: Number },
    },
  })
  poster: {
    chatId: string;
    messageId: number;
  };

  @Prop({
    type: [
      {
        fileName: { type: String },
        size: { type: String },
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
    chatId: string;
    messageId: number;
    fileId: string;
  }[];
}

export const MovieSchema = SchemaFactory.createForClass(Movie);
