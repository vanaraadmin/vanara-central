export interface PassportStorageBindings {
  R2_STORAGE: R2Bucket;
}

export type PassportStorageBody = ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob;

export interface UploadPassportInput {
  body: PassportStorageBody;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadedPassport {
  objectKey: string;
}

const PASSPORTS_PREFIX = "passports/";
const PASSPORT_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
};

function storageLookupKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  return `${PASSPORTS_PREFIX}${normalized.replace(new RegExp(`^${PASSPORTS_PREFIX}`), "")}`;
}

function createPassportObjectKey(contentType: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const extension = PASSPORT_IMAGE_EXTENSIONS[contentType] ?? "bin";
  return `${PASSPORTS_PREFIX}${today}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadPassport(env: PassportStorageBindings, input: UploadPassportInput): Promise<UploadedPassport> {
  const objectKey = createPassportObjectKey(input.contentType);
  await env.R2_STORAGE.put(objectKey, input.body, {
    httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
    customMetadata: input.metadata,
  });
  return { objectKey };
}

export async function getPassport(env: PassportStorageBindings, key: string): Promise<R2ObjectBody | null> {
  return env.R2_STORAGE.get(storageLookupKey(key));
}

export async function deletePassport(env: PassportStorageBindings, key: string): Promise<void> {
  await env.R2_STORAGE.delete(storageLookupKey(key));
}

export async function existsPassport(env: PassportStorageBindings, key: string): Promise<boolean> {
  return (await env.R2_STORAGE.head(storageLookupKey(key))) !== null;
}
