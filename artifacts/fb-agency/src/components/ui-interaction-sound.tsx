import { useEffect } from "react";
import { playUiClick } from "@/lib/interaction-sound";

const INTERACTIVE_SELECTOR = '[data-ui-sound="true"]';

function isDisabled(element: Element): boolean {
  return (
    element.getAttribute("aria-disabled") === "true" ||
    (element instanceof HTMLButtonElement && element.disabled) ||
    (element instanceof HTMLInputElement && element.disabled) ||
    (element instanceof HTMLSelectElement && element.disabled)
  );
}

function closestInteractive(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) : null;
}

export function UiInteractionSound() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const interactive = closestInteractive(event.target);
      if (interactive && !isDisabled(interactive)) playUiClick();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const interactive = closestInteractive(event.target);
      if (interactive && !isDisabled(interactive)) playUiClick();
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
