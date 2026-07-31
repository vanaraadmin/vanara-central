export interface PassportStorageBindings {
  R2_STORAGE: R2Bucket;
}

export type PassportStorageBody = ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob;

export interface UploadPassportInput {
  key: string;
  body: PassportStorageBody;
  contentType?: string;
  metadata?: Record<string, string>;
}

const PASSPORTS_PREFIX = "passports/";

function passportObjectKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  return `${PASSPORTS_PREFIX}${normalized.replace(new RegExp(`^${PASSPORTS_PREFIX}`), "")}`;
}

export async function uploadPassport(env: PassportStorageBindings, input: UploadPassportInput): Promise<R2Object> {
  return env.R2_STORAGE.put(passportObjectKey(input.key), input.body, {
    httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
    customMetadata: input.metadata,
  });
}

export async function getPassport(env: PassportStorageBindings, key: string): Promise<R2ObjectBody | null> {
  return env.R2_STORAGE.get(passportObjectKey(key));
}

export async function deletePassport(env: PassportStorageBindings, key: string): Promise<void> {
  await env.R2_STORAGE.delete(passportObjectKey(key));
}

export async function existsPassport(env: PassportStorageBindings, key: string): Promise<boolean> {
  return (await env.R2_STORAGE.head(passportObjectKey(key))) !== null;
}
