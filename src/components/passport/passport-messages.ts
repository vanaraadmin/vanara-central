import type { PassportClassificationDecision } from "../../types/reception";
import i18n from "../../i18n";

export type PassportMessageKey =
  | PassportClassificationDecision["messageKey"]
  | "passport.checkFailed"
  | "passport.ocrFailed"
  | "passport.notReadable"
  | "passport.pageIncomplete"
  | "passport.numberNotVerified"
  | "passport.networkProblem"
  | "passport.openAiTimeout"
  | "passport.mrzValidationFailed"
  | "passport.ocrInconsistency"
  | "passport.unknownInternal"
  | "passport.saveFailed"
  | "passport.imageUnreadable"
  | "passport.imageTooSmall"
  | "passport.cropFailed";

export const PASSPORT_MESSAGES: Record<PassportMessageKey, string> = {
  "passport.ready": "Ready to scan.",
  "passport.notPassport": "This is not a passport.",
  "passport.notBiodataPage": "Open the passport on the biodata page.",
  "passport.moveCloser": "Move slightly closer.",
  "passport.pageIncomplete": "Passport page is incomplete.",
  "passport.showMrz": "Show the bottom passport code.",
  "passport.moreLight": "More light would improve the scan.",
  "passport.tooBlurry": "The passport is too blurry.",
  "passport.avoidReflections": "Avoid reflections.",
  "passport.checkFailed": "Passport check failed.",
  "passport.ocrFailed": "OCR scan failed.",
  "passport.notReadable": "Passport is not readable.",
  "passport.numberNotVerified": "Passport number could not be verified.",
  "passport.networkProblem": "Network problem.",
  "passport.openAiTimeout": "OpenAI timeout.",
  "passport.mrzValidationFailed": "MRZ validation failed.",
  "passport.ocrInconsistency": "OCR inconsistency detected.",
  "passport.unknownInternal": "Unknown internal error.",
  "passport.saveFailed": "Passport record could not be saved.",
  "passport.imageUnreadable": "The image could not be read. Please choose another photo.",
  "passport.imageTooSmall": "The passport area is too small. Move closer and retake the photo.",
  "passport.cropFailed": "The passport crop could not be prepared. Please retake the photo.",
};

const PASSPORT_MESSAGE_I18N_KEYS: Partial<Record<PassportMessageKey, string>> = {
  "passport.ready": "passportReady",
  "passport.notPassport": "passportNotPassport",
  "passport.notBiodataPage": "passportNotBiodataPage",
  "passport.moveCloser": "passportMoveSlightlyCloser",
  "passport.pageIncomplete": "passportPageIncomplete",
  "passport.showMrz": "showBottomCode",
  "passport.moreLight": "moreLightNeeded",
  "passport.tooBlurry": "passportTooBlurry",
  "passport.avoidReflections": "passportAvoidReflections",
  "passport.checkFailed": "passportCheckFailed",
  "passport.ocrFailed": "passportOcrFailed",
  "passport.notReadable": "passportImageUnreadable",
  "passport.numberNotVerified": "passportNumberNotVerified",
  "passport.networkProblem": "passportNetworkProblem",
  "passport.openAiTimeout": "passportOpenAiTimeout",
  "passport.mrzValidationFailed": "passportMrzValidationFailed",
  "passport.ocrInconsistency": "passportOcrInconsistency",
  "passport.unknownInternal": "passportUnknownInternal",
  "passport.saveFailed": "passportSaveFailed",
  "passport.imageUnreadable": "passportImageUnreadable",
  "passport.imageTooSmall": "passportImageTooSmall",
  "passport.cropFailed": "passportCropFailed",
};

export function passportMessage(key: PassportMessageKey, fallback?: string): string {
  const i18nKey = PASSPORT_MESSAGE_I18N_KEYS[key];
  if (i18nKey) {
    const translated = i18n.t(i18nKey);
    if (translated !== i18nKey) return translated;
  }
  return PASSPORT_MESSAGES[key] ?? fallback ?? PASSPORT_MESSAGES["passport.unknownInternal"];
}
