import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Setting, settingSchema } from '../movie-bot/settings.schema';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Setting.name, schema: settingSchema }]),
  ],
  providers: [SettingsService],
  exports: [SettingsService, MongooseModule],
})
export class SettingsModule {}
