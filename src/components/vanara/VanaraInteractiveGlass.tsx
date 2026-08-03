import {
  createElement,
  type ComponentPropsWithoutRef,
  type ElementType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useGlassPhysics } from "../../hooks/useGlassPhysics";

type VanaraInteractiveGlassOwnProps<T extends ElementType = "button"> = {
  as?: T;
  children: ReactNode;
  className?: string;
  materialClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  pressed?: boolean;
  ariaLabel?: string;
  onPress?: () => void;
};

export type VanaraInteractiveGlassProps<T extends ElementType = "button"> =
  VanaraInteractiveGlassOwnProps<T> &
  Omit<
    ComponentPropsWithoutRef<T>,
    keyof VanaraInteractiveGlassOwnProps<T> | "aria-label" | "onClick"
  >;

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

/**
 * Purpose: provides the shared Vanara Glass Physics interaction wrapper.
 *
 * When to use: tappable glass surfaces that need the standard pressure,
 * highlight, shadow, and release response.
 *
 * When NOT to use: passive glass sheets, text-only labels, inputs, checkboxes,
 * or controls that already contain another interactive element.
 *
 * Expected children: the complete visible content of the single interactive
 * root.
 *
 * Accessibility notes: the root remains the semantic control; decorative
 * material layers are hidden from assistive technology and pointer events.
 */
export default function VanaraInteractiveGlass<T extends ElementType = "button">({
  as,
  ariaLabel,
  children,
  className,
  contentClassName,
  disabled = false,
  materialClassName,
  onPress,
  pressed,
  ...rest
}: VanaraInteractiveGlassProps<T>) {
  const Root = (as ?? "button") as ElementType;
  const isNativeButton = !as || as === "button";
  const glassPhysics = useGlassPhysics({ disabled });
  const isPressed = pressed ?? glassPhysics.pressed;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onPress?.();
  };

  return createElement(
    Root,
    {
      ...rest,
      ...glassPhysics.eventHandlers,
      "aria-disabled": !isNativeButton && disabled ? "true" : undefined,
      "aria-label": ariaLabel,
      className: joinClassNames("vc-interactive-surface", className),
      "data-disabled": disabled ? "true" : "false",
      "data-pressed": isPressed ? "true" : "false",
      disabled: isNativeButton ? disabled : undefined,
      onClick: handleClick,
      type: isNativeButton ? ((rest as { type?: string }).type ?? "button") : undefined,
    },
    createElement("span", {
      "aria-hidden": "true",
      className: joinClassNames("vc-interactive-surface__material", materialClassName),
    }),
    createElement("span", {
      "aria-hidden": "true",
      className: "vc-interactive-surface__highlight",
    }),
    createElement(
      "span",
      { className: joinClassNames("vc-interactive-surface__content", contentClassName) },
      children,
    ),
  );
}
