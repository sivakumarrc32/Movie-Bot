import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MovieBotService } from './movie-bot.service';
import { Movie, MovieSchema } from './movie.schema';
import { MovieBotController } from './movie-bot.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Movie.name, schema: MovieSchema }]),
  ],
  providers: [MovieBotService],
  controllers: [MovieBotController],
})
export class MovieBotModule {}
