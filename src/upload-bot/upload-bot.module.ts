import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadBotService } from './upload-bot.service';
import { Movie, MovieSchema } from '../movie-bot/movie.schema';
import { UploadBotController } from './upload-bot.controller';
import { User, UserSchema } from 'src/movie-bot/user.schema';
import { TempMessage, TempMessageSchema } from 'src/movie-bot/temp.schema';
import { Anime, AnimeSchema } from 'src/anime/anime.schema';
import { AnimeUser, AnimeUserSchema } from 'src/anime/anime.user.schema';
import {
  RequestMovies,
  RequestMoviesSchema,
} from 'src/movie-bot/requestMovies.schema';
import { Setting, settingSchema } from 'src/movie-bot/settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Movie.name, schema: MovieSchema },
      { name: User.name, schema: UserSchema },
      { name: TempMessage.name, schema: TempMessageSchema },
      { name: Anime.name, schema: AnimeSchema },
      { name: AnimeUser.name, schema: AnimeUserSchema },
      { name: RequestMovies.name, schema: RequestMoviesSchema },
      { name: Setting.name, schema: settingSchema },
    ]),
  ],
  providers: [UploadBotService],
  controllers: [UploadBotController],
})
export class UploadBotModule {}
