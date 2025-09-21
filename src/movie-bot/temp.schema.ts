import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class TempMessage extends Document {
  @Prop({ required: true }) chatId: number;
  @Prop({ required: true }) messageId: number;
  @Prop({ required: true }) userId: number;
  @Prop({ required: true }) expireAt: Date;
}

export const TempMessageSchema = SchemaFactory.createForClass(TempMessage);
