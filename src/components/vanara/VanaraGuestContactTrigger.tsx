import type { MouseEvent, Ref } from "react";
import type { VanaraGuestContact } from "./VanaraGuestContactSheet";
import "../../styles/VanaraGuestContact.css";

type VanaraGuestContactTriggerProps = {
  contact: VanaraGuestContact;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

/**
 * Circular address-book action for opening the shared Guest Contact sheet.
 *
 * Use this only beside an active guest identity in operational stay cards or
 * room workspaces. It is not a generic icon button and should not be restyled
 * per page. The icon is decorative; the button label carries the accessible
 * name and must remain tied to the guest being contacted.
 */
export default function VanaraGuestContactTrigger({
  buttonRef,
  contact,
  onClick,
}: VanaraGuestContactTriggerProps) {
  return (
    <button
      aria-label={`Contact ${contact.guestName}`}
      className="vanara-guest-contact-trigger"
      onClick={onClick}
      ref={buttonRef}
      type="button"
    >
      <AddressBookIcon />
    </button>
  );
}

export function AddressBookIcon() {
  return (
    <svg aria-hidden="true" className="vanara-guest-contact-icon" viewBox="0 0 24 24" focusable="false">
      <path d="M7.25 4.25h8.5a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5h-8.5a2.5 2.5 0 0 1-2.5-2.5V6.75a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M8.75 8.25h6.5" />
      <path d="M8.75 12h6.5" />
      <path d="M8.75 15.75H13" />
      <path d="M4.75 8h-1.5" />
      <path d="M4.75 12h-1.5" />
      <path d="M4.75 16h-1.5" />
    </svg>
  );
}
