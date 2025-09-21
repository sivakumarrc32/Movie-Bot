import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { TempMessage } from 'src/movie-bot/temp.schema';
import { Telegraf } from 'telegraf';

@Injectable()
export class CommonService {
  public bot: Telegraf;
  constructor(
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
  }
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredMessages() {
    const now = new Date();
    const messages = await this.tempMessageModel.find({
      expireAt: { $lte: now },
    });

    for (const msg of messages) {
      try {
        await this.bot.telegram
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
