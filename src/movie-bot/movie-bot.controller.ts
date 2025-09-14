import { Controller, Post, Body, Res } from '@nestjs/common';
import { MovieBotService } from './movie-bot.service';
import type { Response } from 'express';

@Controller('movie-bot')
export class MovieBotController {
  constructor(private readonly movieBotService: MovieBotService) {}

  @Post()
  async handleUpdate(@Body() body: any, @Res() res: Response) {
    try {
      await this.movieBotService.bot.handleUpdate(body);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('MovieBot webhook error:', err.message);
      return res.status(500).send('Error processing update');
    }
  }
}
