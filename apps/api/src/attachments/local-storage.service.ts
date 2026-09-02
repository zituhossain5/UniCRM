import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

@Injectable()
export class LocalStorageService {
  private readonly root = resolve(process.env.UNICRM_UPLOAD_DIR ?? '.local/uploads');

  async put(key: string, content: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(key), content, { flag: 'wx' });
  }

  async get(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      throw new NotFoundException('Attachment content not found');
    }
  }

  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
      throw cause;
    }
  }

  private path(key: string) {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new NotFoundException('Attachment content not found');
    return resolve(this.root, key);
  }
}
