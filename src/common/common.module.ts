import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Movie, MovieSchema } from 'src/movie-bot/movie.schema';
import { User, UserSchema } from 'src/movie-bot/user.schema';
import { TempMessage, TempMessageSchema } from 'src/movie-bot/temp.schema';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Movie.name, schema: MovieSchema },
      { name: User.name, schema: UserSchema },
      { name: TempMessage.name, schema: TempMessageSchema },
    ]),
  ],
  providers: [CommonService, ConfigService],
})
export class CommonModule {}
