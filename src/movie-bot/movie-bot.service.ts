import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { Movie } from './movie.schema';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MovieBotService implements OnModuleInit {
  public bot: Telegraf;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
  }

  onModuleInit() {
    // Start command
    this.bot.start(async (ctx) => {
      try {
        await ctx.reply(
          '👋 <b>Welcome to Movie Bot!</b>\n\n🎥 Use <code>/list</code> to see all available movies.\n\n✨ Just type the movie name to get details instantly!',
          { parse_mode: 'HTML' },
        );
      } catch (err) {
        console.error('Start command error:', err.message);
      }
    });

    // /list command
    this.bot.command('list', async (ctx) => {
      try {
        const movies = await this.movieModel.find({}, 'name');
        if (!movies.length)
          return ctx.reply(
            '<b>😢 No movies available We will Add Movies Soon.</b>',
            { parse_mode: 'HTML' },
          );

        let msg = '🎬 <b>Movies List</b>:\n\n';
        movies.forEach((m, i) => (msg += `<b>${i + 1}. ${m.name}</b>\n`));
        msg += '\n👉 Type the <b>movie name</b> to get details.';

        await ctx.reply(msg, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('/list command error:', err.message);
      }
    });

    // Handle movie search
    this.bot.on('text', async (ctx) => {
      try {
        const name = ctx.message.text.trim();
        const movie = await this.movieModel.findOne({ name });

        if (!movie)
          return ctx.reply('❌ Movie not found. <b>Use</b> /list.', {
            parse_mode: 'HTML',
          });

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
