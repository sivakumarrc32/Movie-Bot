/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TempMessage } from 'src/movie-bot/temp.schema';

@Injectable()
export class CommonService {
  private movieBotToken: string;
  private animeBotToken: string;

  constructor(
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
  ) {
    this.movieBotToken = this.configService.get<string>('MOVIE_BOT_TOKEN')!;
    this.animeBotToken = this.configService.get<string>('ANIME_BOT_TOKEN')!;
  }

  private async deleteTelegramMessage(
    token: string,
    chatId: number,
    messageId: number,
  ): Promise<{ ok: boolean; description?: string }> {
    const url = `https://api.telegram.org/bot${token}/deleteMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    return res.json() as Promise<{ ok: boolean; description?: string }>;
  }

  async handleExpiredMessages() {
    const now = new Date();
    const messages = await this.tempMessageModel.find({
      expireAt: { $lte: now },
    });

    console.log(`🔍 Found ${messages.length} expired messages to delete`);

    for (const msg of messages) {
      try {
        const token =
          msg.botType === 'anime' ? this.animeBotToken : this.movieBotToken;

        console.log(
          `▶ Deleting | bot: ${msg.botType ?? 'movie'} | chatId: ${msg.chatId} | messageId: ${msg.messageId}`,
        );

        const result = await this.deleteTelegramMessage(
          token,
          Number(msg.chatId),
          Number(msg.messageId),
        );

        if (result.ok) {
          console.log(`✅ Deleted messageId: ${msg.messageId}`);
        } else {
          console.warn(
            `⚠️ Telegram rejected messageId ${msg.messageId}: ${result.description}`,
          );
        }

        await this.tempMessageModel.deleteOne({ _id: msg._id });
      } catch (err) {
        console.error('💥 Cron delete error:', (err as Error).message);
      }
    }

    console.log(`🏁 Done processing expired messages`);
  }
}