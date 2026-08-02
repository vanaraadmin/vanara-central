export interface PassportClassificationBindings {
  OPENAI_API_KEY: string;
}

export interface PassportClassificationInput {
  image: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "image/heif";
  mrzCrop?: ArrayBuffer;
}

export interface PassportClassification {
  isPassport: boolean;
  isPassportBiodataPage: boolean;
  passportConfidence: number;
  passportComplete: boolean;
  mrzVisible: boolean;
  excessiveGlare: boolean;
  unreadableBlur: boolean;
  unreadableDarkness: boolean;
  recommendation: string;
}

export interface PassportClassificationDecision {
  ready: boolean;
  code:
    | "passport_ready"
    | "not_a_passport"
    | "not_biodata_page"
    | "passport_confidence_low"
    | "passport_incomplete"
    | "mrz_not_visible"
    | "unreadable_darkness"
    | "unreadable_blur"
    | "excessive_glare";
  messageKey:
    | "passport.ready"
    | "passport.notPassport"
    | "passport.notBiodataPage"
    | "passport.moveCloser"
    | "passport.pageIncomplete"
    | "passport.showMrz"
    | "passport.moreLight"
    | "passport.tooBlurry"
    | "passport.avoidReflections";
  message: string;
}

export interface PassportClassificationResult {
  classification: PassportClassification;
  timing: {
    model: string;
    classificationMs: number;
    httpStatus: number;
    openAiRequestId: string | null;
  };
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_PASSPORT_CLASSIFICATION_MODEL = "gpt-5.6-terra";
const OPENAI_PASSPORT_CLASSIFICATION_TIMEOUT_MS = 8_000;

const PASSPORT_CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isPassport",
    "isPassportBiodataPage",
    "passportConfidence",
    "passportComplete",
    "mrzVisible",
    "excessiveGlare",
    "unreadableBlur",
    "unreadableDarkness",
    "recommendation",
  ],
  properties: {
    isPassport: { type: "boolean" },
    isPassportBiodataPage: { type: "boolean" },
    passportConfidence: { type: "number" },
    passportComplete: { type: "boolean" },
    mrzVisible: { type: "boolean" },
    excessiveGlare: { type: "boolean" },
    unreadableBlur: { type: "boolean" },
    unreadableDarkness: { type: "boolean" },
    recommendation: { type: "string" },
  },
} as const;

export class PassportClassificationError extends Error {
  constructor(
    message: string,
    public readonly code: "openai_request_failed" | "openai_timeout" | "openai_invalid_response" | "passport_classification_schema_invalid",
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function openAiErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== "string") {
    return "OpenAI passport classification request failed.";
  }
  return payload.error.message;
}

function outputTextFrom(response: unknown): string {
  if (!isRecord(response)) {
    throw new PassportClassificationError("OpenAI returned an invalid response.", "openai_invalid_response");
  }
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) {
    throw new PassportClassificationError("OpenAI response did not include structured output text.", "openai_invalid_response");
  }
  const parts: string[] = [];
  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && contentItem.type === "output_text" && typeof contentItem.text === "string") {
        parts.push(contentItem.text);
      }
    }
  }
  if (parts.length === 0) {
    throw new PassportClassificationError("OpenAI response did not include structured output text.", "openai_invalid_response");
  }
  return parts.join("");
}

export function validatePassportClassification(value: unknown): PassportClassification {
  if (!isRecord(value)) {
    throw new PassportClassificationError("Passport classification response is not a JSON object.", "passport_classification_schema_invalid");
  }
  const allowedFields = new Set([
    "isPassport",
    "isPassportBiodataPage",
    "passportConfidence",
    "passportComplete",
    "mrzVisible",
    "excessiveGlare",
    "unreadableBlur",
    "unreadableDarkness",
    "recommendation",
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new PassportClassificationError("Passport classification contains unexpected fields.", "passport_classification_schema_invalid");
  }
  if (
    typeof value.isPassport !== "boolean"
    || typeof value.isPassportBiodataPage !== "boolean"
    || typeof value.passportConfidence !== "number"
    || !Number.isFinite(value.passportConfidence)
    || value.passportConfidence < 0
    || value.passportConfidence > 1
    || typeof value.passportComplete !== "boolean"
    || typeof value.mrzVisible !== "boolean"
    || typeof value.excessiveGlare !== "boolean"
    || typeof value.unreadableBlur !== "boolean"
    || typeof value.unreadableDarkness !== "boolean"
    || typeof value.recommendation !== "string"
  ) {
    throw new PassportClassificationError("Passport classification does not match the required schema.", "passport_classification_schema_invalid");
  }
  return {
    isPassport: value.isPassport,
    isPassportBiodataPage: value.isPassportBiodataPage,
    passportConfidence: value.passportConfidence,
    passportComplete: value.passportComplete,
    mrzVisible: value.mrzVisible,
    excessiveGlare: value.excessiveGlare,
    unreadableBlur: value.unreadableBlur,
    unreadableDarkness: value.unreadableDarkness,
    recommendation: value.recommendation.trim(),
  };
}

export function decidePassportClassification(classification: PassportClassification): PassportClassificationDecision {
  if (!classification.isPassport) {
    return { ready: false, code: "not_a_passport", messageKey: "passport.notPassport", message: "This is not a passport." };
  }
  if (!classification.isPassportBiodataPage) {
    return { ready: false, code: "not_biodata_page", messageKey: "passport.notBiodataPage", message: "Open the passport on the biodata page." };
  }
  if (classification.unreadableDarkness) {
    return { ready: false, code: "unreadable_darkness", messageKey: "passport.moreLight", message: "More light would improve the scan." };
  }
  if (classification.unreadableBlur) {
    return { ready: false, code: "unreadable_blur", messageKey: "passport.tooBlurry", message: "The passport is too blurry." };
  }
  if (classification.excessiveGlare) {
    return { ready: false, code: "excessive_glare", messageKey: "passport.avoidReflections", message: "Avoid reflections." };
  }
  if (!classification.passportComplete && (!classification.mrzVisible || classification.passportConfidence < 0.88)) {
    return { ready: false, code: "passport_incomplete", messageKey: "passport.pageIncomplete", message: "Passport page is incomplete." };
  }
  if (classification.passportConfidence < 0.65) {
    return { ready: false, code: "passport_confidence_low", messageKey: "passport.moveCloser", message: "Move slightly closer." };
  }
  if (!classification.mrzVisible) {
    return { ready: false, code: "mrz_not_visible", messageKey: "passport.showMrz", message: "Show the bottom passport code." };
  }
  return { ready: true, code: "passport_ready", messageKey: "passport.ready", message: "Ready to scan." };
}

async function classifyPassportImageWithMetadata(
  env: PassportClassificationBindings,
  input: PassportClassificationInput,
  fetcher: Fetcher = fetch,
): Promise<{ classification: PassportClassification; httpStatus: number; openAiRequestId: string | null }> {
  const imageUrl = `data:${input.contentType};base64,${arrayBufferToBase64(input.image)}`;
  const mrzCropUrl = input.mrzCrop ? `data:${input.contentType};base64,${arrayBufferToBase64(input.mrzCrop)}` : null;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OPENAI_PASSPORT_CLASSIFICATION_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetcher(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: abortController.signal,
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_PASSPORT_CLASSIFICATION_MODEL,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Look at this image.",
                "Return ONLY valid JSON using the supplied strict schema.",
                "Do not perform OCR.",
                "Do not extract names, numbers, dates, nationality, or any passport field.",
                "Only decide whether the image shows an open passport biodata page suitable for TM30 passport scanning.",
                "Use the first image as the canonical full biodata-page candidate crop.",
                "If present, use the second image as an enlarged lower MRZ region crop to decide whether the bottom passport code is visible.",
                "Reject tables, blank scenes, driving licences, ID cards, passport covers, visa pages, stamps pages, and cropped or unreadable passport pages.",
                "Set isPassport true only when a physical passport book/page is visible.",
                "Set isPassportBiodataPage true only when the printed identity/biodata page is visible.",
                "Set passportConfidence from 0 to 1 for confidence that this is a passport biodata page.",
                "Set passportComplete false only when critical biodata or MRZ areas are cut; mild non-critical margin crop is acceptable.",
                "Set mrzVisible true when the bottom machine-readable passport code is visible in either image, even if small in the full image.",
                "Vanara Reception often has warm, subdued indoor lighting.",
                "Do not mark unreadableDarkness true merely because the image is slightly dark or warm-toned.",
                "Mark unreadableDarkness true only when the biodata text, passport number, or MRZ cannot be read reliably because lighting is materially insufficient.",
                "A slightly dark but sharp and readable passport should pass this classification.",
                "Flag unreadableBlur and excessiveGlare only when they materially prevent reliable reading.",
                "Use recommendation for a short receptionist instruction matching the decision.",
              ].join(" "),
            },
            { type: "input_image", image_url: imageUrl, detail: "high" },
            ...(mrzCropUrl ? [{ type: "input_image", image_url: mrzCropUrl, detail: "high" }] : []),
          ],
        }],
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "passport_document_classification",
            strict: true,
            schema: PASSPORT_CLASSIFICATION_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new PassportClassificationError("OpenAI passport classification request timed out.", "openai_timeout");
    }
    throw new PassportClassificationError("OpenAI passport classification request failed.", "openai_request_failed");
  } finally {
    clearTimeout(timeout);
  }

  const openAiRequestId = response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PassportClassificationError(openAiErrorMessage(payload), "openai_request_failed");
  }
  const text = outputTextFrom(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PassportClassificationError("OpenAI returned malformed passport classification JSON.", "openai_invalid_response");
  }
  return {
    classification: validatePassportClassification(parsed),
    httpStatus: response.status,
    openAiRequestId,
  };
}

export async function classifyPassportImage(
  env: PassportClassificationBindings,
  input: PassportClassificationInput,
  fetcher: Fetcher = fetch,
): Promise<PassportClassification> {
  return (await classifyPassportImageWithMetadata(env, input, fetcher)).classification;
}

export async function classifyPassportImageWithTiming(
  env: PassportClassificationBindings,
  input: PassportClassificationInput,
  fetcher: Fetcher = fetch,
): Promise<PassportClassificationResult> {
  const start = Date.now();
  const result = await classifyPassportImageWithMetadata(env, input, fetcher);
  return {
    classification: result.classification,
    timing: {
      model: OPENAI_PASSPORT_CLASSIFICATION_MODEL,
      classificationMs: Date.now() - start,
      httpStatus: result.httpStatus,
      openAiRequestId: result.openAiRequestId,
    },
  };
}
