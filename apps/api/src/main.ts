import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StructuredLogger } from './common/structured-logger.service';
import { allowedCorsOrigins } from './config/cors';
import type { EnvironmentVariables } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const logger = app.get(StructuredLogger);
  const nodeEnvironment = config.get('NODE_ENV', { infer: true });
  const trustedProxyHops = config.get('TRUSTED_PROXY_HOPS', { infer: true });

  app.useLogger(logger);
  if (trustedProxyHops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: unknown) => void;
    };
    express.set('trust proxy', trustedProxyHops);
  }
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts:
        nodeEnvironment === 'production' ? { maxAge: 15_552_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const origins = allowedCorsOrigins(config.get('CORS_ORIGINS', { infer: true }), nodeEnvironment);
  app.enableCors({
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    origin: origins,
  });

  const host = config.get('API_HOST', { infer: true });
  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, host);
  logger.log(`UniCRM API listening on http://${host}:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
