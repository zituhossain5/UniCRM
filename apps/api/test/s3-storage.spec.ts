import { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { S3StorageService } from '../src/attachments/s3-storage.service';

const objectKey = 'b221f0ab-bb73-4cba-b764-8f1d6110c719';

function createStorage(mode: 'none' | 'AES256' | 'aws:kms', kmsKeyId?: string) {
  const values: Record<string, unknown> = {
    STORAGE_S3_ACCESS_KEY_ID: 'access',
    STORAGE_S3_BUCKET: 'attachments',
    STORAGE_S3_ENDPOINT: 'https://s3.example.com',
    STORAGE_S3_FORCE_PATH_STYLE: true,
    STORAGE_S3_KMS_KEY_ID: kmsKeyId,
    STORAGE_S3_PREFIX: 'crm',
    STORAGE_S3_REGION: 'us-east-1',
    STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
    STORAGE_S3_SERVER_SIDE_ENCRYPTION: mode,
  };
  const storage = new S3StorageService({
    get: (key: string) => values[key],
  } as never);
  const send = vi.fn<(command: unknown) => Promise<Record<string, never>>>().mockResolvedValue({});

  Object.defineProperty(storage, 'client', { value: { send } });
  return { send, storage };
}

async function uploadedInput(mode: 'none' | 'AES256' | 'aws:kms', kmsKeyId?: string) {
  const { send, storage } = createStorage(mode, kmsKeyId);
  await storage.put(objectKey, Buffer.from('content'), { contentType: 'text/plain' });

  const command = send.mock.calls[0]?.[0];
  expect(command).toBeInstanceOf(PutObjectCommand);
  return (command as PutObjectCommand).input;
}

describe('S3 attachment server-side encryption', () => {
  it('omits encryption headers when configured as none', async () => {
    const input = await uploadedInput('none');

    expect(input).not.toHaveProperty('ServerSideEncryption');
    expect(input).not.toHaveProperty('SSEKMSKeyId');
  });

  it('requests S3-managed AES256 encryption when configured', async () => {
    const input = await uploadedInput('AES256');

    expect(input.ServerSideEncryption).toBe('AES256');
    expect(input).not.toHaveProperty('SSEKMSKeyId');
  });

  it('requests KMS encryption and includes its configured key ID', async () => {
    const input = await uploadedInput('aws:kms', 'alias/unicrm-attachments');

    expect(input.ServerSideEncryption).toBe('aws:kms');
    expect(input.SSEKMSKeyId).toBe('alias/unicrm-attachments');
  });

  it('allows the provider default KMS key when no key ID is configured', async () => {
    const input = await uploadedInput('aws:kms');

    expect(input.ServerSideEncryption).toBe('aws:kms');
    expect(input).not.toHaveProperty('SSEKMSKeyId');
  });
});
