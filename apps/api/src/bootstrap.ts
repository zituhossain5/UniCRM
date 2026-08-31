import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IdentityBootstrapService } from './bootstrap.service';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

loadEnv({ path: join(process.cwd(), '.env') });
loadEnv({ path: join(process.cwd(), '..', '..', '.env') });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for bootstrap`);
  return value;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(IdentityBootstrapService).run({
      organizationName: required('UNICRM_BOOTSTRAP_ORG_NAME'),
      organizationSlug: required('UNICRM_BOOTSTRAP_ORG_SLUG').toLowerCase(),
      adminEmail: required('UNICRM_BOOTSTRAP_ADMIN_EMAIL'),
      adminPassword: required('UNICRM_BOOTSTRAP_ADMIN_PASSWORD'),
      adminFirstName: required('UNICRM_BOOTSTRAP_ADMIN_FIRST_NAME'),
      adminLastName: required('UNICRM_BOOTSTRAP_ADMIN_LAST_NAME'),
    });
    process.stdout.write(
      `UniCRM bootstrap complete. Organization ${result.organizationCreated ? 'created' : 'already existed'}; Owner ${result.ownerCreated ? 'created' : 'already existed'}.\n`,
    );
  } finally {
    await app.close();
  }
}

void main();
