import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EnvironmentVariables } from '../config/environment';
import type { AttachmentStorage } from './storage.service';

@Injectable()
export class LocalStorageService implements AttachmentStorage {
  private readonly root: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.root = resolve(config.get('STORAGE_LOCAL_DIR', { infer: true }));
  }

  async put(key: string, content: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(key), content, { flag: 'wx' });
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.path(key));
    } catch {
      throw new NotFoundException('Attachment content not found');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
      throw cause;
    }
  }

  private path(key: string) {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new NotFoundException('Attachment content not found');
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root)) throw new NotFoundException('Attachment content not found');
    return path;
  }
}
