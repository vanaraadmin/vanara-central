export interface PassportLivePreflightBindings {
  OPENAI_API_KEY: string;
}

export interface PassportLivePreflightInput {
  image: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "image/heif";
}

export interface PassportLivePreflight {
  biodataPageDetected: boolean;
  documentInsideFrame: boolean;
  mrzLikelyVisible: boolean;
  confidence: number;
  instruction:
    | "searching"
    | "move_inside_frame"
    | "open_biodata_page"
    | "move_closer"
    | "show_bottom_code"
    | "hold_steady"
    | "more_light"
    | "ready";
}

export interface PassportLivePreflightResult {
  preflight: PassportLivePreflight;
  timing: {
    model: string;
    livePreflightMs: number;
    httpStatus: number;
    openAiRequestId: string | null;
  };
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_PASSPORT_LIVE_PREFLIGHT_MODEL = "gpt-5.6-luna";
const OPENAI_PASSPORT_LIVE_PREFLIGHT_TIMEOUT_MS = 5_000;

const PASSPORT_LIVE_PREFLIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["biodataPageDetected", "documentInsideFrame", "mrzLikelyVisible", "confidence", "instruction"],
  properties: {
    biodataPageDetected: { type: "boolean" },
    documentInsideFrame: { type: "boolean" },
    mrzLikelyVisible: { type: "boolean" },
    confidence: { type: "number" },
    instruction: {
      enum: [
        "searching",
        "move_inside_frame",
        "open_biodata_page",
        "move_closer",
        "show_bottom_code",
        "hold_steady",
        "more_light",
        "ready",
      ],
    },
  },
} as const;

export class PassportLivePreflightError extends Error {
  constructor(
    message: string,
    public readonly code: "openai_request_failed" | "openai_timeout" | "openai_invalid_response" | "passport_live_preflight_schema_invalid",
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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
    return "OpenAI live passport preflight request failed.";
  }
  return payload.error.message;
}

function outputTextFrom(response: unknown): string {
  if (!isRecord(response)) throw new PassportLivePreflightError("OpenAI returned an invalid response.", "openai_invalid_response");
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) throw new PassportLivePreflightError("OpenAI response did not include structured output text.", "openai_invalid_response");
  const parts: string[] = [];
  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && contentItem.type === "output_text" && typeof contentItem.text === "string") parts.push(contentItem.text);
    }
  }
  if (parts.length === 0) throw new PassportLivePreflightError("OpenAI response did not include structured output text.", "openai_invalid_response");
  return parts.join("");
}

export function validatePassportLivePreflight(value: unknown): PassportLivePreflight {
  if (!isRecord(value)) throw new PassportLivePreflightError("Live passport preflight response is not a JSON object.", "passport_live_preflight_schema_invalid");
  const allowedFields = new Set(["biodataPageDetected", "documentInsideFrame", "mrzLikelyVisible", "confidence", "instruction"]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new PassportLivePreflightError("Live passport preflight contains unexpected fields.", "passport_live_preflight_schema_invalid");
  }
  const instruction = value.instruction;
  if (
    typeof value.biodataPageDetected !== "boolean"
    || typeof value.documentInsideFrame !== "boolean"
    || typeof value.mrzLikelyVisible !== "boolean"
    || typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
    || !["searching", "move_inside_frame", "open_biodata_page", "move_closer", "show_bottom_code", "hold_steady", "more_light", "ready"].includes(String(instruction))
  ) {
    throw new PassportLivePreflightError("Live passport preflight does not match the required schema.", "passport_live_preflight_schema_invalid");
  }
  return {
    biodataPageDetected: value.biodataPageDetected,
    documentInsideFrame: value.documentInsideFrame,
    mrzLikelyVisible: value.mrzLikelyVisible,
    confidence: value.confidence,
    instruction: instruction as PassportLivePreflight["instruction"],
  };
}

export function isPassportLivePreflightReady(preflight: PassportLivePreflight, confidenceThreshold = 0.72): boolean {
  return preflight.biodataPageDetected
    && preflight.documentInsideFrame
    && preflight.mrzLikelyVisible
    && preflight.confidence >= confidenceThreshold;
}

export async function runPassportLivePreflight(
  env: PassportLivePreflightBindings,
  input: PassportLivePreflightInput,
  fetcher: Fetcher = fetch,
): Promise<PassportLivePreflightResult> {
  const start = Date.now();
  const imageUrl = `data:${input.contentType};base64,${arrayBufferToBase64(input.image)}`;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OPENAI_PASSPORT_LIVE_PREFLIGHT_TIMEOUT_MS);
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
        model: OPENAI_PASSPORT_LIVE_PREFLIGHT_MODEL,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Classify this low-resolution camera frame for passport capture.",
                "Return only strict JSON.",
                "Do not perform OCR and do not extract identity fields.",
                "Detect whether an open passport biodata page is inside the landscape guide.",
                "Reject gardens, chairs, tables, faces, passport covers, visa pages, stamps pages, ID cards, and random scenes.",
                "Set mrzLikelyVisible true only when the lower machine-readable code area appears present.",
                "Use instruction ready only when all capture requirements are satisfied.",
              ].join(" "),
            },
            { type: "input_image", image_url: imageUrl, detail: "low" },
          ],
        }],
        reasoning: { effort: "none" },
        text: {
          format: {
            type: "json_schema",
            name: "passport_live_preflight",
            strict: true,
            schema: PASSPORT_LIVE_PREFLIGHT_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    if (isAbortError(error)) throw new PassportLivePreflightError("Passport live preflight timed out.", "openai_timeout");
    throw new PassportLivePreflightError("OpenAI live preflight request failed.", "openai_request_failed");
  } finally {
    clearTimeout(timeout);
  }

  const openAiRequestId = response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new PassportLivePreflightError(openAiErrorMessage(payload), "openai_request_failed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputTextFrom(payload));
  } catch {
    throw new PassportLivePreflightError("OpenAI returned malformed live preflight JSON.", "openai_invalid_response");
  }
  return {
    preflight: validatePassportLivePreflight(parsed),
    timing: {
      model: OPENAI_PASSPORT_LIVE_PREFLIGHT_MODEL,
      livePreflightMs: Date.now() - start,
      httpStatus: response.status,
      openAiRequestId,
    },
  };
}
