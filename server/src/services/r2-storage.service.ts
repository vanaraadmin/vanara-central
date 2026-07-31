export interface R2StorageBindings {
  R2_STORAGE: R2Bucket;
}

export type R2StorageBody = ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob;

export interface R2UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export const PASSPORTS_PREFIX = "passports/";

function passportKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  return normalized.startsWith(PASSPORTS_PREFIX) ? normalized : `${PASSPORTS_PREFIX}${normalized}`;
}

export async function upload(env: R2StorageBindings, key: string, body: R2StorageBody, options: R2UploadOptions = {}): Promise<R2Object> {
  return env.R2_STORAGE.put(passportKey(key), body, {
    httpMetadata: options.contentType ? { contentType: options.contentType } : undefined,
    customMetadata: options.metadata,
  });
}

export async function get(env: R2StorageBindings, key: string): Promise<R2ObjectBody | null> {
  return env.R2_STORAGE.get(passportKey(key));
}

export async function deleteObject(env: R2StorageBindings, key: string): Promise<void> {
  await env.R2_STORAGE.delete(passportKey(key));
}

export { deleteObject as delete };
