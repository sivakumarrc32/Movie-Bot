import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
Schema({ timestamps: true });
export class Setting extends Document {
  @Prop()
  boturl: string;
  @Prop()
  animeboturl: string;
}

export const settingSchema = SchemaFactory.createForClass(Setting);
