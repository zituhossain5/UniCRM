import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Prisma commands');
}

export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
  schema: 'prisma/schema.prisma',
});
