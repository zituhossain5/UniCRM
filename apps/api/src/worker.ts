import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { StructuredLogger } from './common/structured-logger.service';
import type { EnvironmentVariables } from './config/environment';
import { WorkerModule } from './jobs/worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  logger.log(
    `UniCRM worker started with WORKER_ENABLED=${String(config.get('WORKER_ENABLED', { infer: true }))}`,
    'Worker',
  );
}

void bootstrap();
