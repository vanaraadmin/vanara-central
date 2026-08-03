import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const PRESS_CANCEL_DISTANCE_PX = 10;

export const GLASS_PHYSICS_SELECTOR = [
  ".vc-interactive-surface",
  ".vc-primary-action",
  ".vc-secondary-action",
  ".vc-secondary-glass-action",
  ".room-domain-card__primary-action",
  ".staff-workspace",
  ".room-row",
  ".maintenance-ticket-row",
  ".housekeeping-v2-task-row",
  ".reception-card",
  ".movement-card",
  ".control-card",
  ".control-alert",
  ".quick-access-grid a",
  ".maintenance-ticket-card",
  ".today-refresh-button",
  ".today-error button",
  ".availability-search__action",
  ".availability-card",
  ".procurement-row",
  ".procurement-card",
  ".vc-summary-item--interactive",
  ".staff-chat__orb",
  ".icon-button",
  ".action-widget",
  ".alert-strip",
  ".primary-action",
  ".submit-button",
].join(",");

const PASSIVE_INPUT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable]",
].join(",");

type PressStart = {
  element: HTMLElement;
  pointerId: number;
  x: number;
  y: number;
};

export type UseGlassPhysicsOptions = {
  disabled?: boolean;
};

export type GlassPhysicsBindings = {
  pressed: boolean;
  eventHandlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
    onBlur: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onKeyUp: (event: KeyboardEvent<HTMLElement>) => void;
  };
};

function isPrimaryPointer(event: globalThis.PointerEvent | PointerEvent<HTMLElement>): boolean {
  if (!event.isPrimary) return false;
  if (event.pointerType === "mouse" && event.button !== 0) return false;
  return true;
}

function movementExceeded(start: { x: number; y: number }, x: number, y: number): boolean {
  return Math.hypot(x - start.x, y - start.y) > PRESS_CANCEL_DISTANCE_PX;
}

function isDisabledSurface(element: HTMLElement): boolean {
  if (element.dataset.disabled === "true") return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element instanceof HTMLButtonElement) return element.disabled;
  if (element instanceof HTMLInputElement) return element.disabled;
  if (element instanceof HTMLSelectElement) return element.disabled;
  if (element instanceof HTMLTextAreaElement) return element.disabled;
  return false;
}

function setPressed(element: HTMLElement, pressed: boolean): void {
  if (pressed) {
    element.dataset.pressed = "true";
    return;
  }

  element.removeAttribute("data-pressed");
}

function resolveSurface(eventTarget: EventTarget | null): HTMLElement | null {
  if (!(eventTarget instanceof Element)) return null;
  if (eventTarget.closest(PASSIVE_INPUT_SELECTOR)) return null;

  const surface = eventTarget.closest<HTMLElement>(GLASS_PHYSICS_SELECTOR);
  if (!surface || isDisabledSurface(surface)) return null;

  return surface;
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Some semantic roots do not support capture in older WebViews.
  }
}

function releasePointer(element: HTMLElement, pointerId: number): void {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already be gone after cancellation or scrolling.
  }
}

export function useGlassPhysics({ disabled = false }: UseGlassPhysicsOptions = {}): GlassPhysicsBindings {
  const [pressed, setPressedState] = useState(false);
  const pressStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const clear = () => {
    pressStartRef.current = null;
    setPressedState(false);
  };

  return {
    pressed: !disabled && pressed,
    eventHandlers: {
      onPointerDown: (event) => {
        if (disabled || !isPrimaryPointer(event)) return;
        pressStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        capturePointer(event.currentTarget, event.pointerId);
        setPressedState(true);
      },
      onPointerMove: (event) => {
        const start = pressStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        if (!movementExceeded(start, event.clientX, event.clientY)) return;
        releasePointer(event.currentTarget, event.pointerId);
        clear();
      },
      onPointerUp: (event) => {
        if (pressStartRef.current?.pointerId === event.pointerId) {
          releasePointer(event.currentTarget, event.pointerId);
        }
        clear();
      },
      onPointerCancel: clear,
      onPointerLeave: (event) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
        clear();
      },
      onBlur: clear,
      onKeyDown: (event) => {
        if (disabled || event.repeat || event.key !== " ") return;
        setPressedState(true);
      },
      onKeyUp: (event) => {
        if (event.key === " " || event.key === "Enter") clear();
      },
    },
  };
}

export function useGlobalGlassPhysics(): void {
  useEffect(() => {
    let activePointer: PressStart | null = null;
    let keyboardSurface: HTMLElement | null = null;

    const clearPointer = () => {
      if (activePointer) {
        releasePointer(activePointer.element, activePointer.pointerId);
        setPressed(activePointer.element, false);
      }
      activePointer = null;
    };

    const clearKeyboard = () => {
      if (keyboardSurface) setPressed(keyboardSurface, false);
      keyboardSurface = null;
    };

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!isPrimaryPointer(event)) return;

      const surface = resolveSurface(event.target);
      if (!surface) return;

      clearPointer();
      activePointer = {
        element: surface,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      capturePointer(surface, event.pointerId);
      setPressed(surface, true);
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!activePointer || activePointer.pointerId !== event.pointerId) return;
      if (!movementExceeded(activePointer, event.clientX, event.clientY)) return;
      clearPointer();
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (activePointer?.pointerId !== event.pointerId) return;
      clearPointer();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || event.key !== " ") return;

      const surface = resolveSurface(event.target);
      if (!surface) return;

      clearKeyboard();
      keyboardSurface = surface;
      setPressed(surface, true);
    };

    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      clearKeyboard();
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("pointermove", handlePointerMove, { capture: true });
    document.addEventListener("pointerup", handlePointerUp, { capture: true });
    document.addEventListener("pointercancel", clearPointer, { capture: true });
    document.addEventListener("lostpointercapture", clearPointer, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("keyup", handleKeyUp, { capture: true });
    document.addEventListener("scroll", clearPointer, { capture: true });
    window.addEventListener("blur", clearPointer);
    window.addEventListener("blur", clearKeyboard);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointermove", handlePointerMove, { capture: true });
      document.removeEventListener("pointerup", handlePointerUp, { capture: true });
      document.removeEventListener("pointercancel", clearPointer, { capture: true });
      document.removeEventListener("lostpointercapture", clearPointer, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("keyup", handleKeyUp, { capture: true });
      document.removeEventListener("scroll", clearPointer, { capture: true });
      window.removeEventListener("blur", clearPointer);
      window.removeEventListener("blur", clearKeyboard);
    };
  }, []);
}
