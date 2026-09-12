import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
// import { UploadBotModule } from './upload-bot/upload-bot.module';
import { MovieBotModule } from './movie-bot/movie-bot.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AnimeModule } from './anime/anime.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    MovieBotModule,
    CommonModule,
    ScheduleModule.forRoot(),
    AnimeModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
