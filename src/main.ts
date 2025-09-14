import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use(bodyParser.json()); // Telegram webhook JSON body handle panna
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
