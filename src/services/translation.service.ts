import { ApiError } from "./api.client";
import type { FreeTextTranslation, FreeTextTranslationPayload, FreeTextTranslationResponse } from "../types/translation";

export async function translateFreeText(payload: FreeTextTranslationPayload, signal?: AbortSignal): Promise<FreeTextTranslation> {
  const response = await fetch("/api/translations/free-text", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  let body: FreeTextTranslationResponse;
  try {
    body = await response.json() as FreeTextTranslationResponse;
  } catch {
    throw new ApiError("The server returned an invalid response", response.status);
  }

  if (!response.ok || !body.success || !body.data) {
    throw new ApiError(body.error ?? "Translation unavailable", response.status);
  }
  return body.data;
}
