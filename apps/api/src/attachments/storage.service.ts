export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');

export interface AttachmentStorage {
  delete(key: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  put(key: string, content: Buffer, metadata?: { contentType?: string }): Promise<void>;
}
