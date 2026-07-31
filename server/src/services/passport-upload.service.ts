export interface PassportImageUpload {
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png";
  fileName: string | null;
}

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function isSupportedPassportImage(file: File): file is File & { type: "image/jpeg" | "image/png" } {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : null;
  const supportedExtension = extension === null || ACCEPTED_EXTENSIONS.has(extension);
  return ACCEPTED_MIME_TYPES.has(file.type) && supportedExtension;
}

export async function normalizePassportImageFormData(formData: FormData): Promise<PassportImageUpload> {
  const files = [...formData.values()].filter((value): value is File => value instanceof File);
  if (files.length !== 1) {
    throw new Error("Exactly one passport image is required.");
  }

  const file = files[0];
  if (!isSupportedPassportImage(file)) {
    throw new Error("Passport image must be a jpg, jpeg, or png file.");
  }

  return {
    bytes: await file.arrayBuffer(),
    contentType: file.type,
    fileName: file.name.trim().length > 0 ? file.name : null,
  };
}
