import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AnimeService } from 'src/anime/anime.service';
import { MovieBotService } from 'src/movie-bot/movie-bot.service';
import { TempMessage } from 'src/movie-bot/temp.schema';
// import { Telegraf } from 'telegraf';

@Injectable()
export class CommonService {
  //   public bot: Telegraf;
  constructor(
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
    private movieBotService: MovieBotService,
    private animeBotService: AnimeService,
  ) {}
  // @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredMessages() {
    const now = new Date();
    const messages = await this.tempMessageModel.find({
      expireAt: { $lte: now },
    });

    for (const msg of messages) {
      try {
        await this.movieBotService.bot.telegram
          .deleteMessage(msg.chatId, msg.messageId)
          .catch(() => null);
        await this.animeBotService.bot.telegram
          .deleteMessage(msg.chatId, msg.messageId)
          .catch(() => null);
        console.log('message deleted');
        await this.tempMessageModel.deleteOne({ _id: msg._id });
      } catch (err) {
        console.error('Cron delete error:', err.message);
      }
    }
  }
}
