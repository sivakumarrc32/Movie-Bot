import { Controller, Get } from '@nestjs/common';
import { CommonService } from './common.service';

@Controller('common')
export class CommonController {
  constructor(private commonService: CommonService) {}

  @Get()
  async deleteExpired() {
    await this.commonService.handleExpiredMessages();
    return { success: true };
  }
}

// curl -F "url=https://movie-bot-woad-gamma.vercel.app/movie-bot" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
