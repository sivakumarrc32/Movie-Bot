import { Module } from '@nestjs/common';
import { AnimeService } from './anime.service';
import { AnimeController } from './anime.controller';
import { Anime, AnimeSchema } from './anime.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { TempMessage, TempMessageSchema } from 'src/movie-bot/temp.schema';
import { AnimeUser, AnimeUserSchema } from './anime.user.schema';
import { User, UserSchema } from 'src/movie-bot/user.schema';
import { Movie, MovieSchema } from 'src/movie-bot/movie.schema';
import {
  RequestMovies,
  RequestMoviesSchema,
} from 'src/movie-bot/requestMovies.schema';
import { Setting, settingSchema } from 'src/movie-bot/settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Anime.name, schema: AnimeSchema },
      { name: AnimeUser.name, schema: AnimeUserSchema },
      { name: TempMessage.name, schema: TempMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Movie.name, schema: MovieSchema },
      { name: RequestMovies.name, schema: RequestMoviesSchema },
      { name: Setting.name, schema: settingSchema },
    ]),
  ],
  controllers: [AnimeController],
  providers: [AnimeService],
})
export class AnimeModule {}
