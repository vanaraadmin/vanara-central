import { useEffect, useId } from "react";
import emailIcon from "../../assets/img/envelope-light.svg";
import whatsappIcon from "../../assets/img/whatsapp-logo-light.svg";
import VanaraGlassSheet from "./VanaraGlassSheet";
import { AddressBookIcon } from "./VanaraGuestContactTrigger";
import { normalizeWhatsappPhone } from "../../utils/guest-contact";
import { useLanguage } from "../../providers/language.context";
import "../../styles/VanaraGuestContact.css";

export type VanaraGuestContact = {
  guestName: string;
  unitName: string;
  phone?: string | null;
  email?: string | null;
};

export type VanaraGuestContactFeedback = "email" | "phone" | null;

type VanaraGuestContactSheetProps = {
  contact: VanaraGuestContact | null;
  feedback: VanaraGuestContactFeedback;
  onCancel: () => void;
  onFeedback: (feedback: VanaraGuestContactFeedback) => void;
};

function useContactSheetScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}

function SheetIcon({ alt = "", src }: { alt?: string; src: string }) {
  return <img alt={alt} className="vanara-guest-contact-sheet__icon-img" src={src} />;
}

/**
 * Shared Guest Contact dialog used by operational booking and room contexts.
 *
 * Use this for the approved Contact Guest flow only. It owns the WhatsApp and
 * email link construction, unavailable-method feedback, scroll lock, and dialog
 * presentation so pages only manage which active guest is selected. Do not use
 * it for generic messaging, internal notes, passport data, or booking details.
 */
export default function VanaraGuestContactSheet({
  contact,
  feedback,
  onCancel,
  onFeedback,
}: VanaraGuestContactSheetProps) {
  const { translate } = useLanguage();
  const titleId = useId();
  useContactSheetScrollLock(Boolean(contact));

  if (!contact) return null;

  const whatsappPhone = normalizeWhatsappPhone(contact.phone);
  const email = contact.email?.trim() || null;

  function openWhatsapp() {
    if (!whatsappPhone) {
      onFeedback("phone");
      return;
    }

    onFeedback(null);
    window.open(
      `https://wa.me/${whatsappPhone}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openEmail() {
    if (!email) {
      onFeedback("email");
      return;
    }

    onFeedback(null);
    window.location.href = `mailto:${email}`;
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="vanara-guest-contact-sheet"
      role="dialog"
    >
      <button
        aria-label={translate("closeContactOptions")}
        className="vanara-guest-contact-sheet__scrim"
        onClick={onCancel}
        type="button"
      />

      <VanaraGlassSheet className="vanara-guest-contact-sheet__panel">
        <div className="vanara-guest-contact-sheet__handle" />

        <header className="vanara-guest-contact-sheet__header">
          <span className="vanara-guest-contact-sheet__header-icon" aria-hidden="true">
            <AddressBookIcon />
          </span>

          <div>
            <span>{translate("guestContact")}</span>
            <h2 id={titleId}>{translate("contactGuest")}</h2>
            <p>
              <strong>{contact.guestName}</strong>
              <span aria-hidden="true"> · </span>
              {contact.unitName}
            </p>
          </div>
        </header>

        <div className="vanara-guest-contact-sheet__actions">
          <button
            className="vanara-guest-contact-sheet__action vanara-guest-contact-sheet__action--primary"
            onClick={openWhatsapp}
            type="button"
          >
            <span className="vanara-guest-contact-sheet__action-icon">
              <SheetIcon src={whatsappIcon} />
            </span>

            <span className="vanara-guest-contact-sheet__action-copy">
              <strong>WhatsApp</strong>
              <small>{whatsappPhone ? translate("openGuestConversation") : translate("phoneNumberUnavailable")}</small>
            </span>

            <span aria-hidden="true" className="vanara-guest-contact-sheet__action-arrow">›</span>
          </button>

          <button
            className="vanara-guest-contact-sheet__action"
            onClick={openEmail}
            type="button"
          >
            <span className="vanara-guest-contact-sheet__action-icon">
              <SheetIcon src={emailIcon} />
            </span>

            <span className="vanara-guest-contact-sheet__action-copy">
              <strong>Email</strong>
              <small>{email ? email : translate("emailAddressUnavailable")}</small>
            </span>

            <span aria-hidden="true" className="vanara-guest-contact-sheet__action-arrow">›</span>
          </button>
        </div>

        {feedback === "phone" && (
          <p className="vanara-guest-contact-sheet__feedback" role="status">
            {translate("phoneNotAvailable")}
          </p>
        )}

        {feedback === "email" && (
          <p className="vanara-guest-contact-sheet__feedback" role="status">
            {translate("emailNotAvailable")}
          </p>
        )}

        <div className="vanara-guest-contact-sheet__footer">
          <button className="vc-secondary-action" onClick={onCancel} type="button">
            {translate("cancel")}
          </button>
        </div>
      </VanaraGlassSheet>
    </div>
  );
}
