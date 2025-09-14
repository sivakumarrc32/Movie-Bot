import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadBotService } from './upload-bot.service';
import { Movie, MovieSchema } from '../movie-bot/movie.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Movie.name, schema: MovieSchema }]),
  ],
  providers: [UploadBotService],
})
export class UploadBotModule {}
