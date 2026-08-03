import { useEffect } from "react";
import { playUiTap } from "../services/uiSound.service";

const INTENTIONAL_TAP_SELECTOR = [
  "button",
  "a[href]",
  '[role="button"]',
  "[data-ui-tap]",
  ".staff-workspace",
  ".room-row",
  ".maintenance-ticket-row",
  ".reception-card",
  ".housekeeping-v2-task-row",
  ".control-card",
  ".control-alert",
  ".movement-card",
  ".maintenance-ticket-card",
  ".vc-summary-item--interactive",
  ".availability-card",
  ".procurement-row",
  ".procurement-card",
].join(",");

const PASSIVE_INPUT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable]",
  "[data-ui-sound='off']",
  "[data-ui-sound='none']",
  ".ui-sound-none",
].join(",");

function isDisabledControl(element: HTMLElement): boolean {
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element instanceof HTMLButtonElement) return element.disabled;
  if (element instanceof HTMLInputElement) return element.disabled;
  if (element instanceof HTMLSelectElement) return element.disabled;
  if (element instanceof HTMLTextAreaElement) return element.disabled;
  return false;
}

function resolveTapTarget(eventTarget: EventTarget | null): HTMLElement | null {
  if (!(eventTarget instanceof Element)) return null;
  if (eventTarget.closest(PASSIVE_INPUT_SELECTOR)) return null;

  const target = eventTarget.closest<HTMLElement>(INTENTIONAL_TAP_SELECTOR);
  if (!target || isDisabledControl(target)) return null;

  return target;
}

function isPrimaryPointer(event: PointerEvent): boolean {
  if (!event.isPrimary) return false;
  if (event.pointerType === "mouse" && event.button !== 0) return false;
  return true;
}

function isKeyboardActivation(event: KeyboardEvent, target: HTMLElement): boolean {
  if (event.repeat || event.defaultPrevented) return false;
  if (event.key === "Enter") return true;
  if (event.key !== " ") return false;

  return target instanceof HTMLButtonElement || target.getAttribute("role") === "button";
}

export function useUiTapSound(): void {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isPrimaryPointer(event)) return;
      if (resolveTapTarget(event.target)) playUiTap();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = resolveTapTarget(event.target);
      if (!target || !isKeyboardActivation(event, target)) return;
      playUiTap();
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);
}
