import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnimeService } from 'src/anime/anime.service';
import { MovieBotService } from 'src/movie-bot/movie-bot.service';
import { TempMessage } from 'src/movie-bot/temp.schema';

@Injectable()
export class CommonService {
  constructor(
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
    private movieBotService: MovieBotService,
    private animeBotService: AnimeService,
  ) {}

  async handleExpiredMessages() {
    const now = new Date();
    const messages = await this.tempMessageModel.find({
      expireAt: { $lte: now },
    });

    console.log(`Found ${messages.length} expired messages to delete`);

    for (const msg of messages) {
      try {
        const bot =
          msg.botType === 'anime'
            ? this.animeBotService.bot
            : this.movieBotService.bot;

        try {
          await bot.telegram.deleteMessage(msg.chatId, msg.messageId);
          console.log(
            `✅ Deleted [${msg.botType}] message ${msg.messageId} from chat ${msg.chatId}`,
          );
        } catch (telegramErr) {
          // Message already deleted or too old — still clean up DB
          console.warn(
            `⚠️ Telegram delete failed for message ${msg.messageId} (still removing from DB): ${telegramErr.message}`,
          );
        }

        await this.tempMessageModel.deleteOne({ _id: msg._id });
      } catch (err) {
        console.error('Cron delete error:', err.message);
      }
    }
  }
}