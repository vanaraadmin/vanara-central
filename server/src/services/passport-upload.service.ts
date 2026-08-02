export interface PassportImageUpload {
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "image/heif";
  passportNumberCrop?: ArrayBuffer;
  mrzCrop?: ArrayBuffer;
}

export interface PassportImageDiagnostics {
  width: number | null;
  height: number | null;
  bytes: number;
  contentType: PassportImageUpload["contentType"];
}

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif"]);
const MAX_PASSPORT_UPLOAD_BYTES = 10 * 1024 * 1024;

export class PassportUploadError extends Error {
  constructor(message: string, public readonly code: "passport_upload_invalid" | "passport_upload_too_large" | "passport_storage_failed") {
    super(message);
  }
}

function isSupportedPassportImage(file: File): file is File & { type: "image/jpeg" | "image/png" | "image/heic" | "image/heif" } {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  const supportedExtension = extension === "" || ACCEPTED_EXTENSIONS.has(extension);
  return ACCEPTED_MIME_TYPES.has(file.type) && supportedExtension;
}

async function optionalCrop(formData: FormData, name: "passportNumberCrop" | "mrzCrop"): Promise<ArrayBuffer | undefined> {
  const value = formData.get(name);
  if (value === null) return undefined;
  if (!(value instanceof File) || !isSupportedPassportImage(value)) {
    throw new PassportUploadError("Passport OCR crops must be jpg, jpeg, png, heic, or heif files.", "passport_upload_invalid");
  }
  if (value.size > MAX_PASSPORT_UPLOAD_BYTES) {
    throw new PassportUploadError("Passport OCR crop must be 10 MB or smaller.", "passport_upload_too_large");
  }
  return value.arrayBuffer();
}

export async function normalizePassportImageFormData(formData: FormData): Promise<PassportImageUpload> {
  const file = formData.get("passport");
  if (!(file instanceof File)) {
    throw new PassportUploadError("Exactly one passport image is required.", "passport_upload_invalid");
  }
  for (const [name, value] of formData.entries()) {
    if (value instanceof File && name !== "passport" && name !== "passportNumberCrop" && name !== "mrzCrop") {
      throw new PassportUploadError("Unsupported passport image field.", "passport_upload_invalid");
    }
  }
  if (file.size > MAX_PASSPORT_UPLOAD_BYTES) {
    throw new PassportUploadError("Passport image must be 10 MB or smaller.", "passport_upload_too_large");
  }

  if (!isSupportedPassportImage(file)) {
    throw new PassportUploadError("Passport image must be a jpg, jpeg, png, heic, or heif file.", "passport_upload_invalid");
  }

  return {
    bytes: await file.arrayBuffer(),
    contentType: file.type,
    passportNumberCrop: await optionalCrop(formData, "passportNumberCrop"),
    mrzCrop: await optionalCrop(formData, "mrzCrop"),
  };
}

export function passportImageDiagnostics(bytes: ArrayBuffer | undefined, contentType: PassportImageUpload["contentType"]): PassportImageDiagnostics | null {
  if (!bytes) return null;
  const data = new Uint8Array(bytes);
  const dimensions = imageDimensions(data, contentType);
  return {
    width: dimensions.width,
    height: dimensions.height,
    bytes: data.byteLength,
    contentType,
  };
}

function imageDimensions(data: Uint8Array, contentType: PassportImageUpload["contentType"]): { width: number | null; height: number | null } {
  if (contentType === "image/png" && data.length >= 24) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (signature.every((byte, index) => data[index] === byte)) {
      return {
        width: readUint32(data, 16),
        height: readUint32(data, 20),
      };
    }
  }
  if (contentType === "image/jpeg" && data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    return jpegDimensions(data);
  }
  return { width: null, height: null };
}

function jpegDimensions(data: Uint8Array): { width: number | null; height: number | null } {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    const length = readUint16(data, offset + 2);
    if (length < 2) return { width: null, height: null };
    if (isStartOfFrame(marker) && offset + 8 < data.length) {
      return {
        height: readUint16(data, offset + 5),
        width: readUint16(data, offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { width: null, height: null };
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) + data[offset + 1];
}

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] * 256 + data[offset + 1]) * 256 + data[offset + 2]) * 256 + data[offset + 3];
}
