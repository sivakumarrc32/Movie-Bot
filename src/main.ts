import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Handler, Context } from 'aws-lambda';
import serverlessExpress from '@vendia/serverless-express';

let server: Handler;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.init();
  app.enableCors();

  const expressApp = app.getHttpAdapter().getInstance();
  server = serverlessExpress({ app: expressApp });
}

bootstrap();

export const handler = (event: any, context: Context) => server(event, context);
