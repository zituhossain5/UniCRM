import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import type { EnvironmentVariables } from '../config/environment';

@Injectable()
export class PasswordService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.config.get('ARGON2_MEMORY_COST', { infer: true }),
      timeCost: this.config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('ARGON2_PARALLELISM', { infer: true }),
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
