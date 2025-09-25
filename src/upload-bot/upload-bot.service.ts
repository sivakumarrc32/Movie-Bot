import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { Movie } from '../movie-bot/movie.schema';
import { ConfigService } from '@nestjs/config';
import { MovieBotService } from 'src/movie-bot/movie-bot.service';

interface SessionData {
  step: string;
  data: any;
}

@Injectable()
export class UploadBotService implements OnModuleInit {
  public bot: Telegraf;
  private sessions: Record<number, SessionData> = {};
  private channelId: string;
  private ownerId: number;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    private configService: ConfigService,
    private movieBotService: MovieBotService,
  ) {
    this.bot = new Telegraf(this.configService.get('UPLOAD_BOT_TOKEN')!);
    this.channelId = '-1002931727367';
    this.ownerId = 992923409;
  }

  private checkOwner(ctx: any): boolean {
    if (ctx.from.id !== this.ownerId) {
      ctx.reply(
        '<b>🚫 You are not authorized to use this bot.</b> \n\n\n @lord_fourth_movie_bot Here You Can Get the Movies',
        {
          parse_mode: 'HTML',
        },
      );
      return false;
    }
    return true;
  }

  onModuleInit() {
    this.bot.start(async (ctx) => {
      try {
        if (!this.checkOwner(ctx)) return;
        this.sessions[ctx.chat.id] = { step: 'name', data: {} };
        await ctx.reply('🎬 Send movie name:');
      } catch (err) {
        console.error('Start error:', err.message);
      }
    });

    this.bot.on('text', async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const session = this.sessions[chatId];
        if (!session) return;

        if (session.step === 'name') {
          session.data.name = ctx.message.text.trim();
          session.step = 'caption';
          return ctx.reply('📝 Send movie caption:');
        }
        if (session.step === 'caption') {
          session.data.caption = ctx.message.text.trim();
          session.step = 'poster';
          return ctx.reply('🖼️ Send movie poster:');
        }
        if (session.step === 'expectedFiles') {
          session.data.expectedFiles = parseInt(ctx.message.text, 10);
          session.data.files = [];
          session.step = 'files';
          return ctx.reply(`📂 Now send ${session.data.expectedFiles} files:`);
        }
      } catch (err) {
        console.error('Text handler error:', err.message);
      }
    });

    this.bot.on('photo', async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const session = this.sessions[chatId];
        if (!session || session.step !== 'poster') return;

        const photo = ctx.message.photo.pop()!;
        const caption = session.data.caption;

        const sent = await this.safeSend(() =>
          ctx.telegram.sendPhoto(this.channelId, photo.file_id, {
            caption: `🎬 ${session.data.name}\n\n${caption}`,
          }),
        );

        if (sent) {
          session.data.poster = {
            chatId: String(sent.chat.id),
            messageId: sent.message_id,
          };
        }

        session.step = 'expectedFiles';
        await ctx.reply('📊 How many files to upload? (Enter number)');
      } catch (err) {
        console.error('Poster upload error:', err.message);
      }
    });

    this.bot.on('document', async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const session = this.sessions[chatId];
        if (!session || session.step !== 'files') return;

        const file = ctx.message.document;

        let fileName;
        if (file.file_name?.startsWith('@')) {
          // Find first separator: space, underscore, or hyphen
          const separators = [' ', '-'];
          let firstSepIndex = -1;

          for (const sep of separators) {
            const idx = file.file_name.indexOf(sep);
            if (idx !== -1) {
              if (firstSepIndex === -1 || idx < firstSepIndex) {
                firstSepIndex = idx;
              }
            }
          }

          if (firstSepIndex !== -1) {
            fileName =
              '@LordFourthMovieTamil' + file.file_name.slice(firstSepIndex);
          } else {
            fileName = '@LordFourthMovieTamil';
          }
        } else {
          fileName = file.file_name;
        }

        console.log(fileName);

        const sent = await this.safeSend(() =>
          ctx.telegram.sendDocument(this.channelId, file.file_id, {
            caption: `${fileName} \n\n Join Channel: https://t.me/LordFourthMovieTamil"`,
          }),
        );

        if (sent) {
          session.data.files.push({
            fileName: fileName,
            size: `${((file.file_size ?? 0) / (1024 * 1024)).toFixed(1)} MB`,
            chatId: String(sent.chat.id),
            messageId: sent.message_id,
            fileId: file.file_id,
          });
        }

        if (session.data.files.length >= session.data.expectedFiles) {
          try {
            const movie = new this.movieModel(session.data);
            await movie.save();
            await this.movieBotService.sendBroadcast(
              `✨ <i><b>${movie.name}</b></i> Movie Added! ✨\n\n` +
                `👉 Type the <b>Movie Name</b> and get the file instantly.\n\n` +
                `🍿 Enjoy Watching!\n\n` +
                `📢 Join Channel: <a href="https://t.me/+A0jFSzfeC-Y0ZmI1">Lord Fourth Movies Tamil</a> \n\n` +
                `📢 Join Channel: <a href="https://t.me/Cinemxtic_Univerz">CINEMATIC UNIVERSE!</a> \n\n`,
            );
            await ctx.reply('✅ Movie uploaded successfully!');
          } catch (dbErr) {
            console.error('DB save error:', dbErr.message);
            await ctx.reply('❌ Error saving movie to DB.');
          }
          delete this.sessions[chatId];
        }
      } catch (err) {
        console.error('Document upload error:', err.message);
      }
    });
  }

  private async safeSend<T>(
    fn: () => Promise<T>,
    attempt = 0,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err: any) {
      if (err.response?.error_code === 429) {
        const retryAfter = err.response.parameters.retry_after || 5;
        console.warn(`⏳ Rate limited. Waiting ${retryAfter}s...`);
        await new Promise((res) => setTimeout(res, retryAfter * 1000));
        return this.safeSend(fn, attempt + 1);
      }
      console.error('Telegram send error:', err.message);
      return null;
    }
  }
}
