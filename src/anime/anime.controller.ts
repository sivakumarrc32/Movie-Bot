import { Body, Controller, Post, Res } from '@nestjs/common';
import { AnimeService } from './anime.service';
import type { Response } from 'express';

@Controller('anime')
export class AnimeController {
  constructor(private readonly animeService: AnimeService) {}
  @Post()
  async handleUpdate(@Body() body: any, @Res() res: Response) {
    try {
      await this.animeService.bot.handleUpdate(body);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('MovieBot webhook error:', err.message);
      return res.status(500).send('Error processing update');
    }
  }
}
