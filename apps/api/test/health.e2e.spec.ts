import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PrismaService } from '../src/database/prisma.service';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { RedisService } from '../src/redis/redis.service';

describe('GET /api/v1/health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('reports the API and its dependencies as connected', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { isHealthy: () => Promise.resolve(true) } },
        { provide: RedisService, useValue: { isHealthy: () => Promise.resolve(true) } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/api/v1/health').expect(200);
    const responseBody: unknown = response.body;

    expect(responseBody).toMatchObject({
      services: {
        api: 'connected',
        database: 'connected',
        redis: 'connected',
      },
      status: 'ok',
    });
    const timestamp = z.object({ timestamp: z.iso.datetime() }).parse(responseBody).timestamp;
    expect(timestamp).toBeTruthy();
  });
});
