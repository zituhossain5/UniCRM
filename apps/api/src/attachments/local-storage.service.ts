import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { EnvironmentVariables } from '../config/environment';
import type { AttachmentStorage } from './storage.service';

@Injectable()
export class LocalStorageService implements AttachmentStorage {
  private readonly root: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.root = resolve(config.get('STORAGE_LOCAL_DIR', { infer: true }));
  }

  async put(key: string, content: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' });
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
    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    if (!new RegExp(`^(?:${uuid}|demo/${uuid}/${uuid})$`, 'i').test(key)) {
      throw new NotFoundException('Attachment content not found');
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new NotFoundException('Attachment content not found');
    }
    return path;
  }
}
