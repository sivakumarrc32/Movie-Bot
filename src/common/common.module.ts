import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Movie, MovieSchema } from 'src/movie-bot/movie.schema';
import { User, UserSchema } from 'src/movie-bot/user.schema';
import { TempMessage, TempMessageSchema } from 'src/movie-bot/temp.schema';
import { ConfigService } from '@nestjs/config';
import { MovieBotService } from 'src/movie-bot/movie-bot.service';
// import { ScheduleModule } from '@nestjs/schedule';
import { CommonController } from './common.controller';
import { AnimeService } from 'src/anime/anime.service';
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
  providers: [CommonService, ConfigService, MovieBotService, AnimeService],
  controllers: [CommonController],
})
export class CommonModule {}
