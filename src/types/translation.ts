export type FreeTextEntityType = "procurement_request" | "chat_message";
export type FreeTextLanguage = "en" | "th";

export interface FreeTextTranslationPayload {
  entityType: FreeTextEntityType;
  entityId: string;
  fieldName: string;
  originalText: string;
  sourceLanguage?: FreeTextLanguage | null;
  targetLanguage?: FreeTextLanguage | null;
}

export interface FreeTextTranslation {
  entityType: FreeTextEntityType;
  entityId: string;
  fieldName: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: FreeTextLanguage;
  targetLanguage: FreeTextLanguage;
  provider: "google_cloud_translation" | "source";
  cached: boolean;
}

export interface FreeTextTranslationResponse {
  success: boolean;
  data?: FreeTextTranslation;
  error?: string;
}
