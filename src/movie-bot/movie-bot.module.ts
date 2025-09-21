import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MovieBotService } from './movie-bot.service';
import { Movie, MovieSchema } from './movie.schema';
import { MovieBotController } from './movie-bot.controller';
import { User, UserSchema } from './user.schema';
import { TempMessage, TempMessageSchema } from './temp.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Movie.name, schema: MovieSchema },
      { name: User.name, schema: UserSchema },
      { name: TempMessage.name, schema: TempMessageSchema },
    ]),
  ],
  providers: [MovieBotService],
  controllers: [MovieBotController],
})
export class MovieBotModule {}
