import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadBotModule } from './upload-bot/upload-bot.module';
import { MovieBotModule } from './movie-bot/movie-bot.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    UploadBotModule,
    MovieBotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
