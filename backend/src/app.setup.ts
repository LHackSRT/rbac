import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createValidationPipe } from './common/validation';
import { config } from './config';

/** HTTP setup shared by the server and the end-to-end tests. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalPipes(createValidationPipe());
}
