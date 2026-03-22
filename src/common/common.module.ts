/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { MongooseModule } from '@nestjs/mongoose';
import { TempMessage, TempMessageSchema } from 'src/movie-bot/temp.schema';
import { CommonController } from './common.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TempMessage.name, schema: TempMessageSchema },
    ]),
  ],
  providers: [CommonService],
  controllers: [CommonController],
})
export class CommonModule {}