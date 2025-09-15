import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { Movie } from './movie.schema';
import { ConfigService } from '@nestjs/config';
import { User } from './user.schema';

@Injectable()
export class MovieBotService implements OnModuleInit {
  public bot: Telegraf;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
  }

  onModuleInit() {
    // Start command
    this.bot.start(async (ctx) => {
      try {
        await ctx.reply(
          '👋 <b>Welcome to Movie Bot!</b>\n\n🎥 Use /list to see all available movies.\n\n✨ Just type the movie name to get movie instantly!',
          { parse_mode: 'HTML' },
        );
        const user = await this.userModel.findOne({
          telegramId: ctx.from.id,
        });
        if (!user) {
          await this.userModel.create({
            telegramId: ctx.from.id,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            username: ctx.from.username,
            languageCode: ctx.from.language_code,
            isBot: ctx.from.is_bot,
          });
        }
      } catch (err) {
        console.error('Start command error:', err.message);
      }
    });

    // /list command
    this.bot.command('list', async (ctx) => {
      try {
        const anime = await ctx.replyWithAnimation(
          'CAACAgUAAxkBAAP2aMg-M9L2BweitSj2A-C__K4Fm-oAAmYZAALItUBW-knJhi1GBE42BA',
        );
        const movies = await this.movieModel.find({}, 'name');
        if (!movies.length) {
          await ctx.deleteMessage(anime.message_id);
          return ctx.reply(
            '<b>😢 No movies available We will Add Movies Soon.</b>',
            { parse_mode: 'HTML' },
          );
        }
        let msg = '🎬 <b>Movies List</b>:\n\n';
        movies.forEach((m, i) => (msg += `<b>${i + 1}. ${m.name}</b>\n`));
        msg += '\n👉 Type the <b>Movie Name</b> to get Movie.';

        await ctx.reply(msg, { parse_mode: 'HTML' });
        await ctx.deleteMessage(anime.message_id);
      } catch (err) {
        console.error('/list command error:', err.message);
      }
    });

    // Handle movie search
    this.bot.on('text', async (ctx) => {
      try {
        const anime = await ctx.replyWithAnimation(
          'CAACAgUAAxkBAAP2aMg-M9L2BweitSj2A-C__K4Fm-oAAmYZAALItUBW-knJhi1GBE42BA',
        );
        const name = ctx.message.text.trim();
        const movie = await this.movieModel.findOne({ name });

        if (!movie) {
          await ctx.deleteMessage(anime.message_id);
          return ctx.reply('❌ Movie not found. <b>Use</b> /list.', {
            parse_mode: 'HTML',
          });
        }
        if (movie.poster?.chatId && movie.poster?.messageId) {
          await ctx.telegram.forwardMessage(
            ctx.chat.id,
            movie.poster.chatId,
            movie.poster.messageId,
          );
        }

        for (const file of movie.files) {
          try {
            await ctx.telegram.forwardMessage(
              ctx.chat.id,
              file.chatId,
              file.messageId,
            );
          } catch (err) {
            console.error('File forward error:', err.message);
          }
        }

        await ctx.deleteMessage(anime.message_id);

        await ctx.reply(
          `✅ <b>Movie "${movie.name}" sent successfully!</b>\n\n🍿 Enjoy watching!`,
          { parse_mode: 'HTML' },
        );
      } catch (err) {
        console.error('Movie search error:', err.message);
      }
    });
  }
}
