import { buildPassportConsensus, type PassportConsensus, type PassportExtraction } from "./passport-consensus.service.js";
import {
  createAndPollPassportOpenAiResponse,
  PassportOpenAiBackgroundError,
} from "./passport-openai-background.service.js";
import {
  runPersistedPassportOpenAiResponse,
  type PassportOcrAttemptBindings,
  type PassportOcrAttemptHandle,
  type PassportOcrStage,
} from "./passport-ocr-attempt.service.js";

export interface PassportOcrBindings extends PassportOcrAttemptBindings {
  OPENAI_API_KEY: string;
}

export interface PassportOcrInput {
  image: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "image/heif";
  passportNumberCrop?: ArrayBuffer;
  mrzCrop?: ArrayBuffer;
  attempt?: PassportOcrAttemptHandle;
}

export interface PassportData {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  gender: string | null;
  birthDate: string | null;
  expiryDate?: string | null;
  verification?: PassportReviewValidation;
}

export interface PassportReviewValidation {
  firstPass: PassportExtraction;
  secondPass: PassportExtraction;
  consensus: PassportConsensus;
  ocrModel: string;
  verificationModel?: string | null;
  schemaVersion: string;
  timing?: PassportOcrTiming;
}

export interface PassportOcrTiming {
  model: string;
  pass1Ms: number;
  pass2Ms: number;
  consensusMs: number;
  totalMs: number;
  pass1Status?: "ok" | "timeout" | "error";
  pass2Status?: "ok" | "timeout" | "error";
  pass1OpenAiRequestId?: string | null;
  pass2OpenAiRequestId?: string | null;
  pass1Attempts?: number;
  pass2Attempts?: number;
  deterministicValidationMs?: number;
  conditionalVerificationMs?: number;
  conditionalVerificationInvoked?: boolean;
  visualModel?: string;
  mrzModel?: string;
  visualMs?: number;
  mrzMs?: number;
  mergeMs?: number;
  verifierMs?: number;
  visualStatus?: "ok" | "timeout" | "error";
  mrzStatus?: "ok" | "timeout" | "error";
  visualOpenAiRequestId?: string | null;
  mrzOpenAiRequestId?: string | null;
  verifierOpenAiRequestId?: string | null;
  verifierTriggerCode?: PassportVerifierTriggerCode | null;
  verifierTimedOut?: boolean;
  manualConfirmationRequired?: boolean;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_PASSPORT_VISUAL_MODEL = "gpt-5.6-terra";
const OPENAI_PASSPORT_MRZ_MODEL = "gpt-5.6-terra";
const OPENAI_PASSPORT_VERIFICATION_MODEL = "gpt-5.6-sol";
const OPENAI_PASSPORT_TIMEOUT_MS = 90_000;
const OPENAI_PASSPORT_VISUAL_TIMEOUT_MS = 60_000;
const OPENAI_PASSPORT_MRZ_TIMEOUT_MS = 60_000;
const OPENAI_PASSPORT_VERIFICATION_TIMEOUT_MS = 45_000;
const PASSPORT_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "passportNumber",
  "nationality",
  "gender",
  "birthDate",
] as const;

const PASSPORT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: PASSPORT_FIELDS,
  properties: {
    firstName: { type: ["string", "null"] },
    middleName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
    passportNumber: { type: ["string", "null"] },
    nationality: { type: ["string", "null"] },
    gender: { type: ["string", "null"] },
    birthDate: { type: ["string", "null"] },
  },
} as const;

const PASSPORT_EXTRACTION_FIELDS = [
  "documentType",
  "issuingCountry",
  "surname",
  "givenNames",
  "passportNumberVisual",
  "nationality",
  "dateOfBirth",
  "sex",
  "expiryDate",
  "personalNumber",
  "mrzLine1",
  "mrzLine2",
  "mrzPassportNumber",
  "rawVisualText",
  "imageQualityAssessment",
  "fieldStatus",
] as const;

const VISUAL_EXTRACTION_FIELDS = [
  "documentType",
  "issuingCountry",
  "surname",
  "givenNames",
  "passportNumberVisual",
  "nationality",
  "dateOfBirth",
  "sex",
  "expiryDate",
  "fieldStatus",
] as const;

const MRZ_EXTRACTION_FIELDS = [
  "mrzLine1",
  "mrzLine2",
  "mrzPassportNumber",
  "passportNumberVisual",
  "fieldStatus",
] as const;

const VERIFIER_FIELDS = [
  "resolved",
  "passportNumber",
  "confidence",
  "needsManualConfirmation",
] as const;

const VISUAL_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: VISUAL_EXTRACTION_FIELDS,
  properties: {
    documentType: { type: ["string", "null"] },
    issuingCountry: { type: ["string", "null"] },
    surname: { type: ["string", "null"] },
    givenNames: { type: ["string", "null"] },
    passportNumberVisual: { type: ["string", "null"] },
    nationality: { type: ["string", "null"] },
    dateOfBirth: { type: ["string", "null"] },
    sex: { type: ["string", "null"] },
    expiryDate: { type: ["string", "null"] },
    fieldStatus: {
      type: "object",
      additionalProperties: false,
      required: VISUAL_EXTRACTION_FIELDS.filter((field) => field !== "fieldStatus"),
      properties: {
        documentType: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        issuingCountry: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        surname: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        givenNames: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        passportNumberVisual: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        nationality: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        dateOfBirth: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        sex: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        expiryDate: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
      },
    },
  },
} as const;

const MRZ_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: MRZ_EXTRACTION_FIELDS,
  properties: {
    mrzLine1: { type: ["string", "null"] },
    mrzLine2: { type: ["string", "null"] },
    mrzPassportNumber: { type: ["string", "null"] },
    passportNumberVisual: { type: ["string", "null"] },
    fieldStatus: {
      type: "object",
      additionalProperties: false,
      required: MRZ_EXTRACTION_FIELDS.filter((field) => field !== "fieldStatus"),
      properties: {
        mrzLine1: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        mrzLine2: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        mrzPassportNumber: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
        passportNumberVisual: { enum: ["READ", "UNCERTAIN", "NOT_FOUND"] },
      },
    },
  },
} as const;

const PASSPORT_VERIFIER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: VERIFIER_FIELDS,
  properties: {
    resolved: { type: "boolean" },
    passportNumber: { type: ["string", "null"] },
    confidence: { type: "number" },
    needsManualConfirmation: { type: "boolean" },
  },
} as const;

const PASSPORT_OCR_SCHEMA_VERSION = "passport-ocr-v2";
type PassportVerifierTriggerCode =
  | "PASSPORT_NUMBER_CONFLICT"
  | "MRZ_CHECKSUM_FAILED"
  | "MANDATORY_FIELD_MISSING"
  | "CRITICAL_CHARACTER_UNCERTAIN";

export class PassportOcrError extends Error {
  constructor(
    message: string,
    public readonly code: "openai_request_failed" | "openai_timeout" | "openai_invalid_response" | "passport_schema_invalid",
    public readonly stage?: "visual_biodata" | "mrz" | "verification" | "extraction",
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

function openAiErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== "string") {
    return "OpenAI OCR request failed.";
  }
  return payload.error.message;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function outputTextFrom(response: unknown): string {
  if (!isRecord(response)) {
    throw new PassportOcrError("OpenAI returned an invalid response.", "openai_invalid_response");
  }

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    throw new PassportOcrError("OpenAI response did not include structured output text.", "openai_invalid_response");
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
    throw new PassportOcrError("OpenAI response did not include structured output text.", "openai_invalid_response");
  }
  return parts.join("");
}

export function validatePassportData(value: unknown): PassportData {
  if (!isRecord(value)) {
    throw new PassportOcrError("Passport OCR response is not a JSON object.", "passport_schema_invalid");
  }

  const allowedFields = new Set<string>(PASSPORT_FIELDS);
  allowedFields.add("expiryDate");
  allowedFields.add("verification");
  const keys = Object.keys(value);
  if (keys.some((key) => !allowedFields.has(key))) {
    throw new PassportOcrError("Passport OCR response does not match the required schema.", "passport_schema_invalid");
  }

  for (const field of PASSPORT_FIELDS) {
    const fieldValue = value[field];
    if (fieldValue !== null && typeof fieldValue !== "string") {
      throw new PassportOcrError("Passport OCR response contains an invalid field value.", "passport_schema_invalid");
    }
  }

  const birthDate = normalizePassportDateForStorage(typeof value.birthDate === "string" ? value.birthDate : null);
  const expiryDate = normalizePassportDateForStorage(typeof value.expiryDate === "string" ? value.expiryDate : null);
  if (typeof value.birthDate === "string" && value.birthDate.trim() && !birthDate) {
    throw new PassportOcrError("Birth date is invalid. Use a date such as 11 DEC 1979.", "passport_schema_invalid");
  }
  if (typeof value.expiryDate === "string" && value.expiryDate.trim() && !expiryDate) {
    throw new PassportOcrError("Expiry date is invalid. Use a date such as 07 JUL 2036.", "passport_schema_invalid");
  }

  return {
    firstName: value.firstName,
    middleName: value.middleName,
    lastName: value.lastName,
    passportNumber: value.passportNumber,
    nationality: value.nationality,
    gender: value.gender,
    birthDate,
    expiryDate,
    verification: isRecord(value.verification) ? value.verification as unknown as PassportReviewValidation : undefined,
  } as PassportData;
}

function readStatus(value: unknown): "READ" | "UNCERTAIN" | "NOT_FOUND" {
  return value === "READ" || value === "UNCERTAIN" || value === "NOT_FOUND" ? value : "NOT_FOUND";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validatePassportExtraction(value: unknown): PassportExtraction {
  if (isRecord(value) && "passportNumber" in value) {
    const legacy = validatePassportData(value);
    return {
      documentType: null,
      issuingCountry: null,
      surname: legacy.lastName,
      givenNames: legacy.firstName,
      passportNumberVisual: legacy.passportNumber,
      nationality: legacy.nationality,
      dateOfBirth: legacy.birthDate,
      sex: legacy.gender,
      expiryDate: legacy.expiryDate ?? null,
      personalNumber: null,
      mrzLine1: null,
      mrzLine2: null,
      mrzPassportNumber: legacy.passportNumber,
      rawVisualText: null,
      imageQualityAssessment: null,
      fieldStatus: {
        documentType: "NOT_FOUND",
        issuingCountry: "NOT_FOUND",
        surname: legacy.lastName ? "READ" : "NOT_FOUND",
        givenNames: legacy.firstName ? "READ" : "NOT_FOUND",
        passportNumberVisual: legacy.passportNumber ? "READ" : "NOT_FOUND",
        nationality: legacy.nationality ? "READ" : "NOT_FOUND",
        dateOfBirth: legacy.birthDate ? "READ" : "NOT_FOUND",
        sex: legacy.gender ? "READ" : "NOT_FOUND",
        expiryDate: legacy.expiryDate ? "READ" : "NOT_FOUND",
        mrzLine1: "NOT_FOUND",
        mrzLine2: "NOT_FOUND",
        mrzPassportNumber: legacy.passportNumber ? "READ" : "NOT_FOUND",
      },
    };
  }

  if (!isRecord(value) || !isRecord(value.fieldStatus)) {
    throw new PassportOcrError("Passport OCR extraction does not match the required schema.", "passport_schema_invalid");
  }
  return {
    documentType: nullableString(value.documentType),
    issuingCountry: nullableString(value.issuingCountry),
    surname: nullableString(value.surname),
    givenNames: nullableString(value.givenNames),
    passportNumberVisual: nullableString(value.passportNumberVisual),
    nationality: nullableString(value.nationality),
    dateOfBirth: nullableString(value.dateOfBirth),
    sex: nullableString(value.sex),
    expiryDate: nullableString(value.expiryDate),
    personalNumber: nullableString(value.personalNumber),
    mrzLine1: nullableString(value.mrzLine1),
    mrzLine2: nullableString(value.mrzLine2),
    mrzPassportNumber: nullableString(value.mrzPassportNumber),
    rawVisualText: nullableString(value.rawVisualText),
    imageQualityAssessment: nullableString(value.imageQualityAssessment),
    fieldStatus: {
      documentType: readStatus(value.fieldStatus.documentType),
      issuingCountry: readStatus(value.fieldStatus.issuingCountry),
      surname: readStatus(value.fieldStatus.surname),
      givenNames: readStatus(value.fieldStatus.givenNames),
      passportNumberVisual: readStatus(value.fieldStatus.passportNumberVisual),
      nationality: readStatus(value.fieldStatus.nationality),
      dateOfBirth: readStatus(value.fieldStatus.dateOfBirth),
      sex: readStatus(value.fieldStatus.sex),
      expiryDate: readStatus(value.fieldStatus.expiryDate),
      mrzLine1: readStatus(value.fieldStatus.mrzLine1),
      mrzLine2: readStatus(value.fieldStatus.mrzLine2),
      mrzPassportNumber: readStatus(value.fieldStatus.mrzPassportNumber),
    },
  };
}

function passportDataFromValidation(validation: PassportReviewValidation): PassportData {
  const fields = validation.consensus.fields;
  return {
    firstName: fields.firstName.value,
    middleName: null,
    lastName: fields.lastName.value,
    passportNumber: fields.passportNumber.value,
    nationality: fields.nationality.value,
    gender: fields.gender.value,
    birthDate: fields.birthDate.value,
    expiryDate: fields.expiryDate.value,
    verification: validation,
  };
}

function statusRecord(fields: readonly string[], value: unknown): Record<string, "READ" | "UNCERTAIN" | "NOT_FOUND"> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(fields.map((field) => [field, readStatus(source[field])]));
}

function emptyStatus(): Record<string, "READ" | "UNCERTAIN" | "NOT_FOUND"> {
  return Object.fromEntries(PASSPORT_EXTRACTION_FIELDS.map((field) => [field, "NOT_FOUND"]));
}

function validateVisualExtraction(value: unknown): PassportExtraction {
  if (!isRecord(value) || !isRecord(value.fieldStatus)) {
    throw new PassportOcrError("Visual biodata response invalid.", "passport_schema_invalid", "visual_biodata");
  }
  const allowedFields = new Set<string>(VISUAL_EXTRACTION_FIELDS);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new PassportOcrError("Visual biodata response invalid.", "passport_schema_invalid", "visual_biodata");
  }
  const visualStatus = statusRecord(VISUAL_EXTRACTION_FIELDS.filter((field) => field !== "fieldStatus"), value.fieldStatus);
  return {
    documentType: nullableString(value.documentType),
    issuingCountry: nullableString(value.issuingCountry),
    surname: nullableString(value.surname),
    givenNames: nullableString(value.givenNames),
    passportNumberVisual: nullableString(value.passportNumberVisual),
    nationality: nullableString(value.nationality),
    dateOfBirth: nullableString(value.dateOfBirth),
    sex: nullableString(value.sex),
    expiryDate: nullableString(value.expiryDate),
    personalNumber: null,
    mrzLine1: null,
    mrzLine2: null,
    mrzPassportNumber: null,
    rawVisualText: null,
    imageQualityAssessment: null,
    fieldStatus: { ...emptyStatus(), ...visualStatus },
  };
}

function validateMrzExtraction(value: unknown): PassportExtraction {
  if (!isRecord(value) || !isRecord(value.fieldStatus)) {
    throw new PassportOcrError("MRZ response invalid.", "passport_schema_invalid", "mrz");
  }
  const allowedFields = new Set<string>(MRZ_EXTRACTION_FIELDS);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new PassportOcrError("MRZ response invalid.", "passport_schema_invalid", "mrz");
  }
  const mrzStatus = statusRecord(MRZ_EXTRACTION_FIELDS.filter((field) => field !== "fieldStatus"), value.fieldStatus);
  return {
    documentType: null,
    issuingCountry: null,
    surname: null,
    givenNames: null,
    passportNumberVisual: nullableString(value.passportNumberVisual),
    nationality: null,
    dateOfBirth: null,
    sex: null,
    expiryDate: null,
    personalNumber: null,
    mrzLine1: nullableString(value.mrzLine1),
    mrzLine2: nullableString(value.mrzLine2),
    mrzPassportNumber: nullableString(value.mrzPassportNumber),
    rawVisualText: null,
    imageQualityAssessment: null,
    fieldStatus: { ...emptyStatus(), ...mrzStatus },
  };
}

function validateVerifierResult(value: unknown): { resolved: boolean; passportNumber: string | null; confidence: number; needsManualConfirmation: boolean } {
  if (!isRecord(value)) {
    throw new PassportOcrError("Verification response invalid.", "passport_schema_invalid", "verification");
  }
  const allowedFields = new Set<string>(VERIFIER_FIELDS);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new PassportOcrError("Verification response invalid.", "passport_schema_invalid", "verification");
  }
  if (
    typeof value.resolved !== "boolean"
    || (value.passportNumber !== null && typeof value.passportNumber !== "string")
    || typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
    || typeof value.needsManualConfirmation !== "boolean"
  ) {
    throw new PassportOcrError("Verification response invalid.", "passport_schema_invalid", "verification");
  }
  return {
    resolved: value.resolved,
    passportNumber: nullableString(value.passportNumber),
    confidence: value.confidence,
    needsManualConfirmation: value.needsManualConfirmation,
  };
}

function remainingMs(deadline: number, stageLimitMs: number): number {
  return Math.max(1, Math.min(stageLimitMs, deadline - Date.now()));
}

async function openAiJsonRequest(
  env: PassportOcrBindings,
  model: string,
  content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "high" }>,
  schemaName: string,
  schema: unknown,
  stage: "visual_biodata" | "mrz" | "verification",
  timeoutMs: number,
  fetcher: Fetcher,
  inputAttempt?: PassportOcrAttemptHandle,
): Promise<{ parsed: unknown; httpStatus: number; openAiRequestId: string | null }> {
  let result: Awaited<ReturnType<typeof createAndPollPassportOpenAiResponse>>;
  const persistedStage: Record<typeof stage, PassportOcrStage> = {
    visual_biodata: "VISUAL_BIODATA",
    mrz: "MRZ",
    verification: "VERIFICATION",
  };
  const body = {
    model,
    input: [{ role: "user", content }],
    reasoning: { effort: stage === "verification" ? "medium" : "low" },
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
  };
  try {
    result = inputAttempt
      ? await runPersistedPassportOpenAiResponse({
          env,
          attempt: inputAttempt,
          stage: persistedStage[stage],
          body,
          fetcher,
          timeoutMs,
        })
      : await createAndPollPassportOpenAiResponse({
          apiKey: env.OPENAI_API_KEY,
          fetcher,
          timeoutMs,
          body,
        });
  } catch (error) {
    if (error instanceof PassportOpenAiBackgroundError && (error.code === "timeout" || error.code === "ambiguous_submission")) {
      const label = stage === "visual_biodata" ? "Visual biodata reading" : stage === "mrz" ? "MRZ reading" : "Verification";
      throw new PassportOcrError(`${label} timed out.`, "openai_timeout", stage);
    }
    throw new PassportOcrError(
      error instanceof Error ? error.message : "OpenAI temporarily unavailable.",
      error instanceof PassportOpenAiBackgroundError && error.code === "invalid_response" ? "openai_invalid_response" : "openai_request_failed",
      stage,
    );
  }

  const text = outputTextFrom(result.payload);
  try {
    return { parsed: JSON.parse(text), httpStatus: result.httpStatus, openAiRequestId: result.openAiRequestId };
  } catch {
    const label = stage === "visual_biodata" ? "Visual biodata response invalid." : stage === "mrz" ? "MRZ response invalid." : "Verification response invalid.";
    throw new PassportOcrError(label, "openai_invalid_response", stage);
  }
}

async function readVisualBiodata(
  env: PassportOcrBindings,
  input: PassportOcrInput,
  deadline: number,
  fetcher: Fetcher,
): Promise<{ extraction: PassportExtraction; ms: number; httpStatus: number; openAiRequestId: string | null }> {
  const start = Date.now();
  const imageUrl = `data:${input.contentType};base64,${arrayBufferToBase64(input.image)}`;
  const result = await openAiJsonRequest(
    env,
    OPENAI_PASSPORT_VISUAL_MODEL,
    [
      {
        type: "input_text",
        text: [
          "Read only human-readable biodata from this open passport biodata page.",
          "Do not read or return MRZ lines.",
          "Do not include raw text, image diagnostics, confidence prose, or fields outside the strict schema.",
          "Extract only document type, issuing country, surname, given names, printed passport number, nationality, date of birth, sex, and expiry date.",
          "Preserve spelling and capitalization from the printed passport.",
          "Never infer missing values; return null and NOT_FOUND or UNCERTAIN when unreadable.",
          "Vanara Reception often has warm, subdued indoor lighting; accept slightly dark text if readable.",
        ].join(" "),
      },
      { type: "input_image", image_url: imageUrl, detail: "high" },
    ],
    "passport_visual_biodata",
    VISUAL_EXTRACTION_JSON_SCHEMA,
    "visual_biodata",
    remainingMs(deadline, OPENAI_PASSPORT_VISUAL_TIMEOUT_MS),
    fetcher,
    input.attempt,
  );
  return { extraction: validateVisualExtraction(result.parsed), ms: Date.now() - start, httpStatus: result.httpStatus, openAiRequestId: result.openAiRequestId };
}

async function readMrzCritical(
  env: PassportOcrBindings,
  input: PassportOcrInput,
  deadline: number,
  fetcher: Fetcher,
): Promise<{ extraction: PassportExtraction; ms: number; httpStatus: number; openAiRequestId: string | null }> {
  const start = Date.now();
  const mrzImage = input.mrzCrop ?? input.image;
  const mrzCropUrl = `data:${input.contentType};base64,${arrayBufferToBase64(mrzImage)}`;
  const passportNumberCropUrl = input.passportNumberCrop ? `data:${input.contentType};base64,${arrayBufferToBase64(input.passportNumberCrop)}` : null;
  const result = await openAiJsonRequest(
    env,
    OPENAI_PASSPORT_MRZ_MODEL,
    [
      {
        type: "input_text",
        text: [
          "Transcribe only critical machine-readable passport fields from the focused crops.",
          "Use the first image as the MRZ crop.",
          passportNumberCropUrl ? "Use the second image only for the printed passport-number crop." : "No printed-number crop is present.",
          "Copy MRZ characters exactly and preserve filler < characters.",
          "Never silently normalize B/8, O/0, I/1, S/5, Z/2, G/6, or A/4.",
          "Mark uncertain or unreadable values as UNCERTAIN or null.",
          "Do not infer missing characters.",
          "Do not return names, nationality, dates, image diagnostics, or raw prose.",
        ].join(" "),
      },
      { type: "input_image", image_url: mrzCropUrl, detail: "high" },
      ...(passportNumberCropUrl ? [{ type: "input_image" as const, image_url: passportNumberCropUrl, detail: "high" as const }] : []),
    ],
    "passport_mrz_critical",
    MRZ_EXTRACTION_JSON_SCHEMA,
    "mrz",
    remainingMs(deadline, OPENAI_PASSPORT_MRZ_TIMEOUT_MS),
    fetcher,
    input.attempt,
  );
  return { extraction: validateMrzExtraction(result.parsed), ms: Date.now() - start, httpStatus: result.httpStatus, openAiRequestId: result.openAiRequestId };
}

function verifierTriggerCode(consensus: PassportConsensus, visual: PassportExtraction, mrz: PassportExtraction): PassportVerifierTriggerCode | null {
  if (consensus.fields.passportNumber.state === "AUTO_VERIFIED") return null;
  const uncertain = [
    visual.fieldStatus.passportNumberVisual,
    mrz.fieldStatus.passportNumberVisual,
    mrz.fieldStatus.mrzLine1,
    mrz.fieldStatus.mrzLine2,
    mrz.fieldStatus.mrzPassportNumber,
  ].includes("UNCERTAIN");
  if (uncertain) return "CRITICAL_CHARACTER_UNCERTAIN";
  if (consensus.mrz.checks.passportNumber === false) return "MRZ_CHECKSUM_FAILED";
  if (consensus.fields.passportNumber.conflicts.length > 0 || consensus.fields.passportNumber.issues.some((issue) => issue.includes("DIFFERS") || issue.includes("DISAGREE"))) {
    return "PASSPORT_NUMBER_CONFLICT";
  }
  return null;
}

const PASSPORT_MONTH_ALIASES: Record<string, number> = {
  JAN: 1, JANV: 1, GEN: 1,
  FEB: 2, FEV: 2,
  MAR: 3,
  APR: 4, AVR: 4,
  MAY: 5, MAI: 5, MAG: 5,
  JUN: 6, JUIN: 6, GIU: 6,
  JUL: 7, JUIL: 7, LUG: 7,
  AUG: 8, AOUT: 8, AGO: 8,
  SEP: 9, SEPT: 9, SET: 9,
  OCT: 10, OTT: 10,
  NOV: 11,
  DEC: 12, DIC: 12,
};

function validPassportIsoDate(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizePassportDateForStorage(value: string | null | undefined): string | null {
  const input = value?.trim() ?? "";
  if (!input) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  if (iso) return validPassportIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})$/.exec(input);
  if (numeric) return validPassportIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, " ")
    .trim();
  const parts = normalized.split(/\s+/);
  if (parts.length !== 3 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{4}$/.test(parts[2])) return null;
  const month = parts[1]
    .split("/")
    .map((part) => PASSPORT_MONTH_ALIASES[part])
    .find((candidate): candidate is number => Boolean(candidate));
  return month ? validPassportIsoDate(Number(parts[2]), month, Number(parts[0])) : null;
}

function mergeVerifierWithOriginalMrz(original: PassportExtraction, verifier: PassportExtraction): PassportExtraction {
  return {
    ...original,
    passportNumberVisual: verifier.passportNumberVisual ?? original.passportNumberVisual,
    mrzPassportNumber: verifier.mrzPassportNumber ?? original.mrzPassportNumber,
    fieldStatus: {
      ...original.fieldStatus,
      passportNumberVisual: verifier.passportNumberVisual
        ? verifier.fieldStatus.passportNumberVisual
        : original.fieldStatus.passportNumberVisual,
      mrzPassportNumber: verifier.mrzPassportNumber
        ? verifier.fieldStatus.mrzPassportNumber
        : original.fieldStatus.mrzPassportNumber,
    },
  };
}

function markManualConfirmationRequired(consensus: PassportConsensus, reason: string): PassportConsensus {
  return {
    ...consensus,
    fields: {
      ...consensus.fields,
      passportNumber: {
        ...consensus.fields.passportNumber,
        state: "NEEDS_CONFIRMATION",
        issues: Array.from(new Set([...consensus.fields.passportNumber.issues, reason, "MANUAL_CONFIRMATION_REQUIRED"])),
      },
    },
    unresolvedCriticalConflicts: Math.max(1, consensus.unresolvedCriticalConflicts),
    tm30Ready: false,
  };
}

async function runConditionalVerifier(
  env: PassportOcrBindings,
  input: PassportOcrInput,
  consensus: PassportConsensus,
  triggerCode: PassportVerifierTriggerCode,
  deadline: number,
  fetcher: Fetcher,
): Promise<{ extraction: PassportExtraction; ms: number; httpStatus: number; openAiRequestId: string | null }> {
  const start = Date.now();
  const mrzImage = input.mrzCrop ?? input.image;
  const mrzCropUrl = `data:${input.contentType};base64,${arrayBufferToBase64(mrzImage)}`;
  const passportNumberCropUrl = input.passportNumberCrop ? `data:${input.contentType};base64,${arrayBufferToBase64(input.passportNumberCrop)}` : null;
  const passportNumber = consensus.fields.passportNumber;
  const candidateValues = [
    passportNumber.visualPass1 ? `visual candidate: ${passportNumber.visualPass1}` : null,
    passportNumber.visualPass2 ? `focused visual candidate: ${passportNumber.visualPass2}` : null,
    passportNumber.mrzPass1 ? `MRZ candidate: ${passportNumber.mrzPass1}` : null,
    passportNumber.mrzPass2 ? `verified MRZ candidate: ${passportNumber.mrzPass2}` : null,
  ].filter(Boolean).join("; ");
  const result = await openAiJsonRequest(
    env,
    OPENAI_PASSPORT_VERIFICATION_MODEL,
    [
      {
        type: "input_text",
        text: [
          "Resolve only the passport-number conflict from focused crops.",
          `Trigger code: ${triggerCode}.`,
          candidateValues ? `Candidate values: ${candidateValues}.` : "Candidate values are missing or uncertain.",
          "Use the first image as the MRZ crop.",
          passportNumberCropUrl ? "Use the second image as the printed passport-number crop." : "No printed-number crop is present.",
          "Copy characters exactly; preserve <; never infer or silently normalize ambiguous characters.",
          "Return only whether the conflict is resolved, the resolved passport number, confidence from 0 to 1, and whether manual confirmation is needed.",
        ].join(" "),
      },
      { type: "input_image", image_url: mrzCropUrl, detail: "high" },
      ...(passportNumberCropUrl ? [{ type: "input_image" as const, image_url: passportNumberCropUrl, detail: "high" as const }] : []),
    ],
    "passport_number_verification",
    PASSPORT_VERIFIER_JSON_SCHEMA,
    "verification",
    remainingMs(deadline, OPENAI_PASSPORT_VERIFICATION_TIMEOUT_MS),
    fetcher,
    input.attempt,
  );
  const verified = validateVerifierResult(result.parsed);
  return {
    extraction: {
      documentType: null,
      issuingCountry: null,
      surname: null,
      givenNames: null,
      passportNumberVisual: verified.passportNumber,
      nationality: null,
      dateOfBirth: null,
      sex: null,
      expiryDate: null,
      personalNumber: null,
      mrzLine1: null,
      mrzLine2: null,
      mrzPassportNumber: verified.passportNumber,
      rawVisualText: null,
      imageQualityAssessment: null,
      fieldStatus: {
        ...emptyStatus(),
        passportNumberVisual: verified.resolved && !verified.needsManualConfirmation ? "READ" : "UNCERTAIN",
        mrzPassportNumber: verified.resolved && !verified.needsManualConfirmation ? "READ" : "UNCERTAIN",
      },
    },
    ms: Date.now() - start,
    httpStatus: result.httpStatus,
    openAiRequestId: result.openAiRequestId,
  };
}

export async function extractPassportReview(env: PassportOcrBindings, input: PassportOcrInput, fetcher: Fetcher = fetch): Promise<PassportData> {
  const totalStart = Date.now();
  const deadline = totalStart + OPENAI_PASSPORT_TIMEOUT_MS;
  const [visualSettled, mrzSettled] = await Promise.allSettled([
    readVisualBiodata(env, input, deadline, fetcher),
    readMrzCritical(env, input, deadline, fetcher),
  ]);

  if (visualSettled.status === "rejected") throw visualSettled.reason;
  if (mrzSettled.status === "rejected") throw mrzSettled.reason;

  const mergeStart = Date.now();
  let consensus = buildPassportConsensus(visualSettled.value.extraction, mrzSettled.value.extraction);
  let mergeMs = Date.now() - mergeStart;
  let verifierResult: Awaited<ReturnType<typeof runConditionalVerifier>> | null = null;
  let secondPass = mrzSettled.value.extraction;
  const triggerCode = verifierTriggerCode(consensus, visualSettled.value.extraction, mrzSettled.value.extraction);
  let verifierTimedOut = false;
  let manualConfirmationRequired = false;
  if (triggerCode) {
    try {
      verifierResult = await runConditionalVerifier(env, input, consensus, triggerCode, deadline, fetcher);
      const verifiedMergeStart = Date.now();
      secondPass = mergeVerifierWithOriginalMrz(mrzSettled.value.extraction, verifierResult.extraction);
      consensus = buildPassportConsensus(visualSettled.value.extraction, secondPass);
      if (consensus.fields.passportNumber.state !== "AUTO_VERIFIED") {
        manualConfirmationRequired = true;
        consensus = markManualConfirmationRequired(consensus, "VERIFICATION_UNRESOLVED");
      }
      mergeMs += Date.now() - verifiedMergeStart;
    } catch (error) {
      if (!(error instanceof PassportOcrError && error.stage === "verification" && error.code === "openai_timeout")) throw error;
      verifierTimedOut = true;
      manualConfirmationRequired = true;
      consensus = markManualConfirmationRequired(consensus, "VERIFICATION_TIMEOUT");
    }
  }

  const validation: PassportReviewValidation = {
    firstPass: visualSettled.value.extraction,
    secondPass,
    consensus,
    ocrModel: `${OPENAI_PASSPORT_VISUAL_MODEL}+${OPENAI_PASSPORT_MRZ_MODEL}`,
    verificationModel: triggerCode ? OPENAI_PASSPORT_VERIFICATION_MODEL : null,
    schemaVersion: PASSPORT_OCR_SCHEMA_VERSION,
    timing: {
      model: `${OPENAI_PASSPORT_VISUAL_MODEL}+${OPENAI_PASSPORT_MRZ_MODEL}`,
      pass1Ms: Math.max(visualSettled.value.ms, mrzSettled.value.ms),
      pass2Ms: verifierResult?.ms ?? 0,
      consensusMs: mergeMs,
      totalMs: Date.now() - totalStart,
      pass1Status: "ok",
      pass2Status: triggerCode ? (verifierTimedOut ? "timeout" : verifierResult ? "ok" : "error") : undefined,
      pass1OpenAiRequestId: visualSettled.value.openAiRequestId,
      pass2OpenAiRequestId: verifierResult?.openAiRequestId ?? null,
      pass1Attempts: 1,
      pass2Attempts: triggerCode ? 1 : 0,
      deterministicValidationMs: mergeMs,
      conditionalVerificationMs: verifierResult?.ms ?? 0,
      conditionalVerificationInvoked: Boolean(triggerCode),
      visualModel: OPENAI_PASSPORT_VISUAL_MODEL,
      mrzModel: OPENAI_PASSPORT_MRZ_MODEL,
      visualMs: visualSettled.value.ms,
      mrzMs: mrzSettled.value.ms,
      mergeMs,
      verifierMs: verifierResult?.ms ?? 0,
      visualStatus: "ok",
      mrzStatus: "ok",
      visualOpenAiRequestId: visualSettled.value.openAiRequestId,
      mrzOpenAiRequestId: mrzSettled.value.openAiRequestId,
      verifierOpenAiRequestId: verifierResult?.openAiRequestId ?? null,
      verifierTriggerCode: triggerCode,
      verifierTimedOut,
      manualConfirmationRequired,
    },
  };
  return passportDataFromValidation(validation);
}

export async function extractPassportData(env: PassportOcrBindings, input: PassportOcrInput, fetcher: Fetcher = fetch): Promise<PassportData> {
  const imageUrl = `data:${input.contentType};base64,${arrayBufferToBase64(input.image)}`;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OPENAI_PASSPORT_TIMEOUT_MS);

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
        model: OPENAI_PASSPORT_VISUAL_MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Extract structured passport data from this image.",
                  "Read only printed passport text.",
                  "Ignore background, fingers, table, reflections, glare, shadows, stamps, handwritten notes, and any non-passport objects.",
                  "Preserve original spelling and capitalization.",
                  "Never invent missing values.",
                  "Return null for any field that is unreadable or absent.",
                  "Return only the strict JSON schema fields.",
                ].join(" "),
              },
              {
                type: "input_image",
                image_url: imageUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "passport_ocr",
            strict: true,
            schema: PASSPORT_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new PassportOcrError("OpenAI passport OCR request timed out.", "openai_timeout");
    }
    throw new PassportOcrError("OpenAI OCR request failed.", "openai_request_failed");
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PassportOcrError(openAiErrorMessage(payload), "openai_request_failed");
  }

  const text = outputTextFrom(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PassportOcrError("OpenAI returned malformed JSON.", "openai_invalid_response");
  }

  return validatePassportData(parsed);
}
