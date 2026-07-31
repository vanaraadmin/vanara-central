export interface PassportImageUpload {
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png";
}

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const MAX_PASSPORT_UPLOAD_BYTES = 10 * 1024 * 1024;

export class PassportUploadError extends Error {
  constructor(message: string, public readonly code: "passport_upload_invalid" | "passport_upload_too_large" | "passport_storage_failed") {
    super(message);
  }
}

function isSupportedPassportImage(file: File): file is File & { type: "image/jpeg" | "image/png" } {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  const supportedExtension = extension === "" || ACCEPTED_EXTENSIONS.has(extension);
  return ACCEPTED_MIME_TYPES.has(file.type) && supportedExtension;
}

export async function normalizePassportImageFormData(formData: FormData): Promise<PassportImageUpload> {
  const files = [...formData.values()].filter((value): value is File => value instanceof File);
  if (files.length !== 1) {
    throw new PassportUploadError("Exactly one passport image is required.", "passport_upload_invalid");
  }

  const file = files[0];
  if (file.size > MAX_PASSPORT_UPLOAD_BYTES) {
    throw new PassportUploadError("Passport image must be 10 MB or smaller.", "passport_upload_too_large");
  }

  if (!isSupportedPassportImage(file)) {
    throw new PassportUploadError("Passport image must be a jpg, jpeg, or png file.", "passport_upload_invalid");
  }

  return {
    bytes: await file.arrayBuffer(),
    contentType: file.type,
  };
}
