import { type RefObject, useEffect } from "react";

export function useOutsidePointerDown<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      const element = ref.current;
      const target = event.target;

      if (!element || !(target instanceof Node) || element.contains(target)) {
        return;
      }

      onOutside();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [enabled, onOutside, ref]);
}
