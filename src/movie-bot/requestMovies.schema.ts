import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class RequestMovies extends Document {
  @Prop()
  name: string;

  @Prop()
  userId: string;

  @Prop()
  userName: string;
}

export const RequestMoviesSchema = SchemaFactory.createForClass(RequestMovies);
