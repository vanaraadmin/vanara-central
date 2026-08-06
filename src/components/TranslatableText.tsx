import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { translateFreeText } from "../services/translation.service";
import type { FreeTextEntityType, FreeTextLanguage } from "../types/translation";
import { useLanguage } from "../providers/language.context";
import "../styles/TranslatableText.css";

interface TranslatableTextProps {
  entityType: FreeTextEntityType;
  entityId: string;
  fieldName: string;
  originalText: string;
  sourceLanguage?: FreeTextLanguage | null;
  targetLanguage?: FreeTextLanguage | null;
  initialTranslatedText?: string | null;
  initialTranslatedLanguage?: FreeTextLanguage | null;
  originalClassName?: string;
  translationClassName?: string;
}

export default function TranslatableText({
  entityType,
  entityId,
  fieldName,
  originalText,
  sourceLanguage,
  targetLanguage,
  initialTranslatedText,
  initialTranslatedLanguage,
  originalClassName,
  translationClassName,
}: TranslatableTextProps) {
  const { translate } = useLanguage();
  const initialMatchesTarget = Boolean(initialTranslatedText && (!targetLanguage || initialTranslatedLanguage === targetLanguage));
  const [translatedText, setTranslatedText] = useState<string | null>(initialMatchesTarget ? initialTranslatedText ?? null : null);
  const [translatedLanguage, setTranslatedLanguage] = useState<FreeTextLanguage | null>(initialMatchesTarget ? initialTranslatedLanguage ?? null : null);

  const mutation = useMutation({
    mutationFn: () => translateFreeText({
      entityType,
      entityId,
      fieldName,
      originalText,
      sourceLanguage,
      targetLanguage,
    }),
    onSuccess: (translation) => {
      setTranslatedText(translation.translatedText);
      setTranslatedLanguage(translation.targetLanguage);
    },
  });

  const shouldOfferTranslate = originalText.trim().length > 0 && (!sourceLanguage || !targetLanguage || sourceLanguage !== targetLanguage);

  return (
    <div className="free-text-translate">
      <p className={originalClassName} lang={sourceLanguage ?? undefined}>{originalText}</p>
      {translatedText ? (
        <p className={translationClassName ?? "free-text-translate__translation"} lang={translatedLanguage ?? targetLanguage ?? undefined}>
          {translatedText}
        </p>
      ) : shouldOfferTranslate ? (
        <button
          className="free-text-translate__button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          type="button"
        >
          {mutation.isPending ? translate("translating") : translate("translate")}
        </button>
      ) : null}
      {mutation.isError ? <p className="free-text-translate__error">{translate("translationUnavailable")}</p> : null}
    </div>
  );
}
