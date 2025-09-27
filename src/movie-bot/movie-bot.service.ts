import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { Movie } from './movie.schema';
import { ConfigService } from '@nestjs/config';
import { User } from './user.schema';
import { TempMessage } from './temp.schema';

@Injectable()
export class MovieBotService implements OnModuleInit {
  public bot: Telegraf;
  public ownerId: number;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(TempMessage.name) private tempMessageModel: Model<TempMessage>,
    private configService: ConfigService,
  ) {
    this.bot = new Telegraf(this.configService.get('MOVIE_BOT_TOKEN')!);
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
    // Start command
    this.bot.start(async (ctx) => {
      try {
        await ctx.replyWithAnimation(
          'CgACAgUAAxkBAAICL2jP7zdwPsDQ8Kocl6nQ1ZXrjI1gAAJYGwACybiAVlKUd15e35cCNgQ', // Local file
          {
            caption:
              '👋 <b>Welcome to Movie Bot!</b>\n\n\n <u><b><i>Available Commands</i></b></u> \n\n 1. /list -Use this command to see all available movies.\n\n 2. /help - To view the commands available in this bot \n\n✨ Just type the movie name to get movie instantly!',
            parse_mode: 'HTML',
          },
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

    // this.bot.on('message', (ctx) => {
    //   console.log(ctx.message);
    // });

    // /help command
    this.bot.command('help', async (ctx) => {
      try {
        await ctx.reply(
          "<u> <b>Available Commands</b> </u>\n\n👉🏻 1. /list -Use this command to see all available movies.\n\n👉🏻 2. /help - To view the commands available in this bot \n\n✨ Just type the movie name to get movie instantly!\n\n <i><b>Note :</b> if you know the movie name then type the movie name corretly and get movie files</i> \n\n<i>if you don't know the exact moive name follow the steps below</i>\n\n<u>Follow the Steps to Get the Movie File</u>\n\n<b>Step - 1 :</b> Use /list Command to get the movie list.\n\n<b>Step - 2 :</b> If the Movie Available in the list <b>Press the Movie Name It Will Be Copied</b> \n\n<b>Step - 3 :</b> Paste and Send the Movie You Will Get the Files \n\n<b>Step - 4 :</b> After Getting the File Forward to Your Friends or In Your Saved Message.\n\n <b> Because Files Will Be Deleted After 5 Mins. For Copyrights Issues</b> \n\n\n <i><b>Thanks For Using Our Bot....❤️</b></i>",
          { parse_mode: 'HTML' },
        );
      } catch (err) {
        console.error('Help command error:', err.message);
      }
    });
    // /list command
    this.bot.command('list', async (ctx) => {
      const anime = await ctx.replyWithAnimation(
        'CAACAgUAAxkBAAP2aMg-M9L2BweitSj2A-C__K4Fm-oAAmYZAALItUBW-knJhi1GBE42BA',
      );
      try {
        const movies = await this.movieModel.find({}, 'name');
        if (!movies.length) {
          await ctx.deleteMessage(anime.message_id);
          return ctx.reply(
            '<b>😢 No movies available We will Add Movies Soon.</b>',
            { parse_mode: 'HTML' },
          );
        }
        let msg =
          '<b><u>Available Movies from :</u> @lord_fourth_movie_bot</b> \n\n🎬 <b>Movies List</b>:\n\n ';
        movies.forEach(
          (m, i) => (msg += `<b>${i + 1}. <code>${m.name}</code></b>\n`),
        );
        msg += '\n👉 Type the <b>Movie Name</b> to get Movie.';

        await ctx.reply(msg, { parse_mode: 'HTML' });
        await ctx.deleteMessage(anime.message_id);
      } catch (err) {
        console.error('/list command error:', err.message);
      }
    });

    this.bot.command('broadcast', async (ctx) => {
      console.log('Broadcast command called');
      if (!this.checkOwner(ctx)) return;
      console.log('Broadcast command authorized');
      const text = ctx.message.text.split(' ').slice(1).join(' ');
      if (!text) return ctx.reply('⚠️ Please provide a message.');
      await this.sendBroadcast(text);
      await ctx.reply('✅ Broadcast sent!');
    });

    // Handle movie search
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;

      const anime = await ctx.replyWithAnimation(
        'CAACAgUAAxkBAAP2aMg-M9L2BweitSj2A-C__K4Fm-oAAmYZAALItUBW-knJhi1GBE42BA',
      );

      try {
        const name = ctx.message.text.trim();
        const movie = await this.movieModel.findOne({
          name: { $regex: name, $options: 'i' },
        });

        if (!movie) {
          await ctx.deleteMessage(anime.message_id);
          return ctx.reply('❌ Movie not found. <b>Use</b> /list.', {
            parse_mode: 'HTML',
          });
        }

        const sentMessages: { chatId: number; messageId: number }[] = [];

        // Poster
        if (movie.poster?.chatId && movie.poster?.messageId) {
          const posterMsg = await ctx.telegram.forwardMessage(
            ctx.chat.id,
            movie.poster.chatId,
            movie.poster.messageId,
          );
          sentMessages.push({
            chatId: ctx.chat.id,
            messageId: posterMsg.message_id,
          });
        }

        // Files
        for (const file of movie.files) {
          const fileMsg = await ctx.telegram.forwardMessage(
            ctx.chat.id,
            file.chatId,
            file.messageId,
          );
          sentMessages.push({
            chatId: ctx.chat.id,
            messageId: fileMsg.message_id,
          });
        }

        await ctx.deleteMessage(anime.message_id);

        const successMsg = await ctx.reply(
          `✅ <b>Movie "${movie.name}" sent successfully!</b>\n\n🍿 Enjoy watching. \n\n\n <b>⏳ Files Will be Deleted After 5 Mins</b> \n\n\n <b>Please Forward to Anywhere or in Saved Message </b>`,
          { parse_mode: 'HTML' },
        );
        sentMessages.push({
          chatId: ctx.chat.id,
          messageId: successMsg.message_id,
        });
        const expireAt = new Date(Date.now() + 5 * 60 * 1000);

        for (const msg of sentMessages) {
          await this.tempMessageModel.create({
            chatId: msg.chatId,
            messageId: msg.messageId,
            userId: ctx.from.id,
            expireAt,
          });
          console.log('message saved');
        }
      } catch (err) {
        console.error('Movie search error:', err.message);
      }
    });
  }

  async sendBroadcast(message: string) {
    try {
      const users = await this.userModel.find({}, 'telegramId');

      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: 'HTML',
          });
        } catch (err) {
          console.error(
            `❌ Could not send to ${user.telegramId}:`,
            err.message,
          );
        }
      }

      console.log(`✅ Broadcast sent to ${users.length} users`);
    } catch (err) {
      console.error('Broadcast error:', err.message);
    }
  }
}
