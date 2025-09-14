import { Controller, Post, Body, Res } from '@nestjs/common';
import { UploadBotService } from './upload-bot.service';
import type { Response } from 'express';

@Controller('upload-bot')
export class UploadBotController {
  constructor(private readonly uploadBotService: UploadBotService) {}

  @Post()
  async handleUpdate(@Body() body: any, @Res() res: Response) {
    try {
      await this.uploadBotService.bot.handleUpdate(body);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('UploadBot webhook error:', err.message);
      return res.status(500).send('Error processing update');
    }
  }
}
