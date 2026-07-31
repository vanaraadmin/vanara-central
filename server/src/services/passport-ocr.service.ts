export interface PassportOcrBindings {
  OPENAI_API_KEY: string;
}

export interface PassportOcrInput {
  image: ArrayBuffer;
  contentType: "image/jpeg" | "image/png";
}

export interface PassportData {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  gender: string | null;
  birthDate: string | null;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_PASSPORT_MODEL = "gpt-5";
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

export class PassportOcrError extends Error {
  constructor(message: string, public readonly code: "openai_request_failed" | "openai_invalid_response" | "passport_schema_invalid") {
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
  const keys = Object.keys(value);
  if (keys.length !== PASSPORT_FIELDS.length || keys.some((key) => !allowedFields.has(key))) {
    throw new PassportOcrError("Passport OCR response does not match the required schema.", "passport_schema_invalid");
  }

  for (const field of PASSPORT_FIELDS) {
    const fieldValue = value[field];
    if (fieldValue !== null && typeof fieldValue !== "string") {
      throw new PassportOcrError("Passport OCR response contains an invalid field value.", "passport_schema_invalid");
    }
  }

  return {
    firstName: value.firstName,
    middleName: value.middleName,
    lastName: value.lastName,
    passportNumber: value.passportNumber,
    nationality: value.nationality,
    gender: value.gender,
    birthDate: value.birthDate,
  } as PassportData;
}

export async function extractPassportData(env: PassportOcrBindings, input: PassportOcrInput, fetcher: Fetcher = fetch): Promise<PassportData> {
  const imageUrl = `data:${input.contentType};base64,${arrayBufferToBase64(input.image)}`;
  const response = await fetcher(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_PASSPORT_MODEL,
      temperature: 0,
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
