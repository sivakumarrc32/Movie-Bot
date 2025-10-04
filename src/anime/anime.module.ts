import { Module } from '@nestjs/common';
import { AnimeService } from './anime.service';
import { AnimeController } from './anime.controller';
import { Anime, AnimeSchema } from './anime.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { TempMessage, TempMessageSchema } from 'src/movie-bot/temp.schema';
import { AnimeUser, AnimeUserSchema } from './anime.user.schema';
import { User, UserSchema } from 'src/movie-bot/user.schema';
import { Movie, MovieSchema } from 'src/movie-bot/movie.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Anime.name, schema: AnimeSchema },
      { name: AnimeUser.name, schema: AnimeUserSchema },
      { name: TempMessage.name, schema: TempMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Movie.name, schema: MovieSchema },
    ]),
  ],
  controllers: [AnimeController],
  providers: [AnimeService],
})
export class AnimeModule {}
