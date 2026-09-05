import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';
import type { AttachmentStorage } from './storage.service';

@Injectable()
export class S3StorageService implements AttachmentStorage {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.bucket = config.get('STORAGE_S3_BUCKET', { infer: true }) ?? '';
    this.prefix = config.get('STORAGE_S3_PREFIX', { infer: true }).replace(/^\/+|\/+$/g, '');
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.get('STORAGE_S3_ACCESS_KEY_ID', { infer: true }) ?? '',
        secretAccessKey: config.get('STORAGE_S3_SECRET_ACCESS_KEY', { infer: true }) ?? '',
      },
      endpoint: config.get('STORAGE_S3_ENDPOINT', { infer: true }),
      forcePathStyle: config.get('STORAGE_S3_FORCE_PATH_STYLE', { infer: true }),
      region: config.get('STORAGE_S3_REGION', { infer: true }),
    });
  }

  async put(key: string, content: Buffer, metadata?: { contentType?: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: content,
        Bucket: this.bucket,
        ContentType: metadata?.contentType,
        Key: this.objectKey(key),
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      );
      const body = response.Body as
        { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
      const bytes = await body?.transformToByteArray?.();
      if (!bytes) throw new Error('Missing object body');
      return Buffer.from(bytes);
    } catch {
      throw new NotFoundException('Attachment content not found');
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }

  private objectKey(key: string): string {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new NotFoundException('Attachment content not found');
    return this.prefix ? `${this.prefix}/${key}` : key;
  }
}
