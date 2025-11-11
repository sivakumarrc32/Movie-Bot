/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telegraf } from 'telegraf';
import { Movie } from '../movie-bot/movie.schema';
import { ConfigService } from '@nestjs/config';
import { MovieBotService } from 'src/movie-bot/movie-bot.service';
import { Anime } from 'src/anime/anime.schema';
import { AnimeService } from 'src/anime/anime.service';

interface SessionData {
  step: string;
  data: any;
}

@Injectable()
export class UploadBotService implements OnModuleInit {
  public bot: Telegraf;
  private sessions: Record<number, SessionData> = {};
  private channelId: string;
  private animeChannelId: string;
  private ownerId: number[];
  private mainAnimeChennalId: string;
  private mainMovieChennalId: string;

  constructor(
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
    @InjectModel(Anime.name) private animeModel: Model<Anime>,
    private configService: ConfigService,
    private movieBotService: MovieBotService,
    private animeBotService: AnimeService,
  ) {
    this.bot = new Telegraf(this.configService.get('UPLOAD_BOT_TOKEN')!);
    this.channelId = '-1002931727367';
    this.animeChannelId = '-1003158050881';
    this.mainMovieChennalId = '-1002154770258';
    this.mainAnimeChennalId = '-1002467182309';
    this.ownerId = [992923409, 2092885661];
  }

  private checkOwner(ctx: any): boolean {
    if (!this.ownerId.includes(ctx.from.id)) {
      ctx.reply(
        '<b>🚫 You are not authorized to use this bot.</b> \n\n\n @lord_fourth_movie2_bot Here You Can Get the Movies',
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
        await ctx.reply(`Welcome to the upload bot 🎬`);
      } catch (err) {
        console.error('Start error:', err.message);
      }
    });

    this.bot.command('movie', async (ctx) => {
      try {
        if (!this.checkOwner(ctx)) return;
        this.sessions[ctx.chat.id] = {
          step: 'name',
          data: { type: 'movie' },
        };
        await ctx.reply('🎬 Send movie name:');
      } catch (err) {
        console.error('Movie command error:', err.message);
      }
    });

    this.bot.command('mepisode', async (ctx) => {
      try {
        if (!this.checkOwner(ctx)) return;
        this.sessions[ctx.chat.id] = {
          step: 'movieEpisode',
          data: { type: 'mepisode' },
        };
        await ctx.reply('🎬 Send movie name:');
      } catch (err) {
        console.error('Movie command error:', err.message);
      }
    });

    this.bot.command('anime', async (ctx) => {
      try {
        if (!this.checkOwner(ctx)) return;
        this.sessions[ctx.chat.id] = {
          step: 'name',
          data: { type: 'anime' },
        };
        await ctx.reply('🎬 Send anime name:');
      } catch (err) {
        console.error('Movie command error:', err.message);
      }
    });

    this.bot.command('aepisode', async (ctx) => {
      try {
        if (!this.checkOwner(ctx)) return;
        this.sessions[ctx.chat.id] = {
          step: 'movieEpisode',
          data: { type: 'aepisode' },
        };
        await ctx.reply('🎬 Send anime name:');
      } catch (err) {
        console.error('Anime command error:', err.message);
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
          return session.data.type === 'anime'
            ? ctx.reply('📝 Send anime caption:')
            : ctx.reply('📝 Send movie caption:');
        }
        if (session.step === 'caption') {
          session.data.caption = ctx.message.text.trim();
          session.step = 'poster';
          return session.data.type === 'anime'
            ? ctx.reply('🖼️ Send anime poster:')
            : ctx.reply('🖼️ Send movie poster:');
        }
        if (session.step === 'broadcastMain') {
          const answer = ctx.message.text.trim().toLowerCase();
          console.log(answer);
          if (answer === 'yes' || answer === 'y') {
            session.data.broadcastMain = true;
            session.step = ['movie', 'anime'].includes(session.data.type)
              ? 'expectedFiles'
              : 'expectedEpiFiles';
            return ctx.reply(` 📊 How many files to upload? (Enter number)`);
          } else if (answer === 'no' || answer === 'n') {
            session.data.broadcastMain = false;
            session.step = ['movie', 'anime'].includes(session.data.type)
              ? 'expectedFiles'
              : 'expectedEpiFiles';
            return ctx.reply(` 📊  How many files to upload? (Enter number)`);
          } else {
            await ctx.reply(
              'Invalid input. Please enter "yes or y" or "no or n" .',
            );
            session.step = 'broadcastMain';
            return;
          }
        }
        if (session.step === 'expectedFiles') {
          session.data.expectedFiles = parseInt(ctx.message.text, 10);
          session.data.files = [];
          session.step = 'files';
          return ctx.reply(`📂 Now send ${session.data.expectedFiles} files:`);
        }
        if (session.step === 'movieEpisode') {
          session.step = 'episodeNumber';
          session.data.epiname = ctx.message.text.trim();
          return ctx.reply('Enter the Episode Numbers :');
        }
        if (session.step === 'episodeNumber') {
          session.step = 'broadcastMain';
          session.data.epiNumber = ctx.message.text.trim();
          return ctx.reply(
            'Do you want to broadcast this episode? (yes or no)',
          );
        }
        if (session.step === 'expectedEpiFiles') {
          session.data.expectedEpiFiles = parseInt(ctx.message.text, 10);
          session.data.files = [];
          session.step = 'epifiles';
          return ctx.reply(
            `📂 Now send ${session.data.expectedEpiFiles} files:`,
          );
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

        const targetChannel =
          session.data.type === 'anime' ? this.animeChannelId : this.channelId;

        const sent = await this.safeSend(() =>
          ctx.telegram.sendPhoto(targetChannel, photo.file_id, {
            caption: `<b>${caption}</b>`,
            parse_mode: 'HTML',
          }),
        );

        if (sent) {
          session.data.poster = {
            chatId: String(sent.chat.id),
            messageId: sent.message_id,
          };
        }

        session.step = 'broadcastMain';
        await ctx.reply('Do you want to broadcast main poster? (yes/no)');
      } catch (err) {
        console.error('Poster upload error:', err.message);
      }
    });

    this.bot.on(['document', 'video'], async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const session = this.sessions[chatId];
        if (
          !session ||
          (session.step !== 'files' && session.step !== 'epifiles')
        )
          return;
        const msg = ctx.message;
        let file;
        if ('document' in msg) {
          file = msg.document;
        } else if ('video' in msg) {
          file = msg.video;
        }

        let fileName;
        let AnimefileName;
        if (session.data.type === 'mepisode' || session.data.type === 'movie') {
          if (file.file_name?.startsWith('@')) {
            const rename = file.file_name.replace(/_/g, ' ');
            const spaceIdx = rename.indexOf(' ');
            // const hyphenIdx = rename.indexOf('-');
            const indices = [spaceIdx].filter((i) => i !== -1);
            const firstSepIndex =
              indices.length > 0 ? Math.min(...indices) : -1;

            if (firstSepIndex !== -1) {
              // include hyphen also
              const Filename =
                '@LordFourthMovieTamil' + file.file_name.slice(firstSepIndex); // keep the hyphen
              fileName = Filename.replace(/_/g, ' ');
            } else {
              const FileName = file.file_name;
              fileName = FileName.replace(/_/g, ' ');
            }
          } else {
            const FileName = file.file_name;
            fileName = FileName.replace(/_/g, ' ');
          }

          console.log(fileName);
        } else if (
          session.data.type === 'anime' ||
          session.data.type === 'aepisode'
        ) {
          if (file.file_name?.startsWith('@')) {
            const rename = file.file_name.replace(/_/g, ' ');
            const spaceIdx = rename.indexOf(' ');
            // const hyphenIdx = rename.indexOf('-');
            const indices = [spaceIdx].filter((i) => i !== -1);
            const firstSepIndex =
              indices.length > 0 ? Math.min(...indices) : -1;

            if (firstSepIndex !== -1) {
              // include hyphen also
              const Filename =
                '@LordFourthAnimeTamil' + file.file_name.slice(firstSepIndex); // keep the hyphen
              AnimefileName = Filename.replace(/_/g, ' ');
            } else {
              const FileName = file.file_name;
              AnimefileName = FileName.replace(/_/g, ' ');
            }
          } else {
            const FileName = file.file_name;
            AnimefileName = FileName.replace(/_/g, ' ');
          }

          console.log(AnimefileName);
        }

        const targetChannel =
          session.data.type === 'anime' ? this.animeChannelId : this.channelId;

        const epiTargetChannel =
          session.data.type === 'aepisode'
            ? this.animeChannelId
            : this.channelId;

        if (session.data.type === 'movie') {
          const sent = await this.safeSend(() =>
            ctx.telegram.sendDocument(targetChannel, file.file_id, {
              caption: `${fileName} \n\n Join Channel: https://t.me/LordFourthMovieTamil \n\n Start Bot : @lord_fourth_movie2_bot`,
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
        } else if (session.data.type === 'anime') {
          const sent = await this.safeSend(() =>
            ctx.telegram.sendDocument(targetChannel, file.file_id, {
              caption: `${AnimefileName} \n\n Join Channel: https://t.me/LordFourthMovieTamil \n\n Start Bot : @lord_fourth_movie2_bot`,
            }),
          );

          if (sent) {
            session.data.files.push({
              fileName: AnimefileName,
              size: `${((file.file_size ?? 0) / (1024 * 1024)).toFixed(1)} MB`,
              chatId: String(sent.chat.id),
              messageId: sent.message_id,
              fileId: file.file_id,
            });
          }
        } else if (session.data.type === 'mepisode') {
          const sent = await this.safeSend(() =>
            ctx.telegram.sendDocument(epiTargetChannel, file.file_id, {
              caption: `${fileName} \n\n Join Channel: https://t.me/LordFourthMovieTamil \n\n Start Bot : @lord_fourth_movie2_bot`,
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
        } else if (session.data.type === 'aepisode') {
          const sent = await this.safeSend(() =>
            ctx.telegram.sendDocument(epiTargetChannel, file.file_id, {
              caption: `${AnimefileName} \n\n Join Channel: https://t.me/LordFourthMovieTamil \n\n Start Bot : @lord_fourth_movie2_bot`,
            }),
          );

          if (sent) {
            session.data.files.push({
              fileName: AnimefileName,
              size: `${((file.file_size ?? 0) / (1024 * 1024)).toFixed(1)} MB`,
              chatId: String(sent.chat.id),
              messageId: sent.message_id,
              fileId: file.file_id,
            });
          }
        }

        const type = session.data.type === 'movie' ? 'movie' : 'anime';

        const expected =
          session.data.type === type
            ? session.data.expectedFiles
            : session.data.expectedEpiFiles;

        if (session.data.files.length >= expected) {
          if (session.data.type === 'movie') {
            try {
              const movie = new this.movieModel(session.data);
              await movie.save();
              // await this.movieBotService.sendBroadcast(
              //   `✨ <i><b>${movie.name}</b></i> Movie Added! ✨\n\n` +
              //     `👉 Type the <b>Movie Name</b> and get the file instantly.\n\n` +
              //     `🍿 Enjoy Watching!\n\n` +
              //     `📢 Join Channel: <a href="https://t.me/+A0jFSzfeC-Y0ZmI1">Lord Fourth Movies Tamil</a> \n\n` +
              //     `📢 Join Channel: <a href="https://t.me/Cinemxtic_Univerz">CINEMATIC UNIVERSE!</a> \n\n`,
              // );
              await ctx.reply('✅ Movie uploaded successfully!');
            } catch (dbErr) {
              console.error('DB save error:', dbErr.message);
              await ctx.reply('❌ Error saving movie to DB.');
            }
          } else if (session.data.type === 'mepisode') {
            try {
              const movieEpisode = await this.movieModel.findOne({
                name: session.data.epiname,
              });
              if (movieEpisode) {
                movieEpisode.files.push(...session.data.files);
                await movieEpisode.save();
                // await this.movieBotService.sendBroadcast(
                //   `✨ <i><b>${movieEpisode.name} ${session.data.epiNumber}</b></i> Movie Episode or Season Added! ✨\n\n` +
                //     `👉 Type the <b>Movie Name</b> and get the file instantly.\n\n` +
                //     `Join the Bot For Anime : @lord_fourth_movie2_bot` +
                //     `🍿 Enjoy Watching!\n\n` +
                //     `📢 Join Channel: <a href="https://t.me/+A0jFSzfeC-Y0ZmI1">Lord Fourth Movies Tamil</a> \n\n` +
                //     `📢 Join Channel: <a href="https://t.me/Cinemxtic_Univerz">CINEMATIC UNIVERSE!</a> \n\n`,
                // );
                await ctx.reply('✅ Movie episode uploaded successfully!');
              }
            } catch (err) {
              console.error('DB save error:', err.message);
              await ctx.reply('❌ Error saving movie to DB.');
            }
          } else if (session.data.type === 'anime') {
            try {
              const anime = new this.animeModel(session.data);
              await anime.save();
              // await this.animeBotService.sendBroadcast(
              //   `✨ <i><b>${anime.name}</b></i> Anime Added! ✨\n\n` +
              //     `👉 Type the <b>Anime Name</b> and get the file instantly.\n\n` +
              //     `Join the Bot For Anime : @lord_fourth_anime_bot` +
              //     `🍿 Enjoy Watching!\n\n` +
              //     `📢 Join Channel: <a href="https://t.me/+A0jFSzfeC-Y0ZmI1">Lord Fourth Movies Tamil</a> \n\n`,
              // );
              await ctx.reply('✅ Anime uploaded successfully!');
            } catch (dbErr) {
              console.error('DB save error:', dbErr.message);
              await ctx.reply('❌ Error saving movie to DB.');
            }
          } else if (session.data.type === 'aepisode') {
            try {
              const animeEpisode = await this.animeModel.findOne({
                name: session.data.epiname,
              });
              if (animeEpisode) {
                animeEpisode.files.push(...session.data.files);
                await animeEpisode.save();
                // await this.animeBotService.sendBroadcast(
                //   `✨ <i><b>${animeEpisode.name} ${session.data.epiNumber}</b></i> Anime Episode or Season Added! ✨\n\n` +
                //     `👉 Type the <b>Anime Name</b> and get the file instantly.\n\n` +
                //     `🍿 Enjoy Watching!\n\n` +
                //     `📢 Join Channel: <a href="https://t.me/+A0jFSzfeC-Y0ZmI1">Lord Fourth Movies Tamil</a> \n\n`,
                // );
                await ctx.reply('✅ Anime episode uploaded successfully!');
              }
            } catch (err) {
              console.error('DB save error:', err.message);
              await ctx.reply('❌ Error saving movie to DB.');
            }
          }

          if (session.data.broadcastMain) {
            const mainChannelId = ['movie', 'mepisode'].includes(
              session.data.type,
            )
              ? this.mainMovieChennalId
              : this.mainAnimeChennalId;

            let posterData = session.data.poster;

            if (session.data.type === 'mepisode') {
              const parentMovie = await this.movieModel.findOne({
                name: session.data.epiname,
              });
              if (parentMovie?.poster) {
                posterData = parentMovie.poster;
              }
            }

            if (session.data.type === 'aepisode') {
              const parentAnime = await this.animeModel.findOne({
                name: session.data.epiname,
              });
              if (parentAnime?.poster) {
                posterData = parentAnime.poster;
              }
            }

            if (['movie', 'mepisode'].includes(session.data.type)) {
              const payload = Buffer.from(
                session.data.name || session.data.epiname,
              ).toString('base64');
              let titleText = session.data.name || session.data.epiname || '';

              if (session.data.type === 'movie') {
                const captionYear =
                  session.data.caption.match(/Year\s*:\s*(\d{4})/);
                const year = captionYear ? parseInt(captionYear[1]) : 0;

                const captionQualityMatch =
                  session.data.caption.match(/Quality\s*:\s*(.+)/);
                const captionQuality = captionQualityMatch
                  ? captionQualityMatch[1].trim()
                  : '';

                if (year) {
                  titleText += ` (${year})`;
                }
                if (captionQuality) {
                  titleText += ` ${captionQuality}`;
                }
              }

              if (session.data.type === 'mepisode') {
                titleText = session.data.episodeNumber || '';
              }

              const messageText = `<blockquote><i><b>${titleText}</b></i></blockquote>\n\nMovie/Episode Uploaded Successfully!\n\n<b>All Quality Upload Completed Click Here 👇🏻</b> \n\n<a href= 'https://t.me/lord_fourth_movie2_bot?start=${payload}'>Click Here And Get Direct File</a>\n<a href= 'https://t.me/lord_fourth_movie2_bot?start=${payload}'>Click Here And Get Direct File</a>\n\n<i><b>Note :</b>Direct File than Varum (No LinkShortner like gplink or Something)</i>`;

              await this.safeSend(() =>
                ctx.telegram.sendMessage(mainChannelId, messageText, {
                  parse_mode: 'HTML',
                }),
              );
            } else if (['anime', 'aepisode'].includes(session.data.type)) {
              const payload = Buffer.from(
                session.data.name || session.data.epiname,
              ).toString('base64');

              const messageText = `\n\n<i><b>${session.data.name || session.data.epiname} ${session.data.epiNumber || ''}</b></i> Anime/Episode Uploaded Successfully!\n\n<b>All Quality Upload Completed Click Here 👇🏻</b> \n\n<a href= 'https://t.me/lord_fourth_anime_bot?start=${payload}'>Click Here And Get Direct File </a>\n<a href= 'https://t.me/lord_fourth_anime_bot?start=${payload}'>Click Here And Get Direct File </a>\n<a href= 'https://t.me/lord_fourth_anime_bot?start=${payload}'>Click Here And Get Direct File </a>`;

              await this.safeSend(() =>
                ctx.telegram.sendMessage(mainChannelId, messageText, {
                  parse_mode: 'HTML',
                }),
              );
            }
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
