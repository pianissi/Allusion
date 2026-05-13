import { RefObject, useEffect, useRef } from 'react';

export interface ScopeInteractionProps {
  /** Hierarchical path (e.g., "main-menu/option-1") */
  currentPath: string;
  /** Triggered when an interaction occurs outside the currentPath branch */
  onOutside?: (event: MouseEvent | FocusEvent) => void;
  /** Triggered when an interaction occurs within the currentPath branch */
  onInside?: (event: MouseEvent | FocusEvent) => void;
  /** Optional Ref to automatically assign the data-logical-path attribute */
  elementRef?: RefObject<Element | null>;
}

export const INTERACTION_PATH_ATTRIBUTE_NAME = 'data-logical-path';

/**
 * Hook to detect interactions (click or focus) outside of a conceptual/hierarchical element tree.
 *
 * It allows managing interaction behaviors like "blur" or others for elements that are logically related (parent/child)
 * but might be physically separated in the DOM (e.g., Portals, Floating UI).
 *
 * It uses a prefix-based path matching (e.g., "menu" matches "menu/sub-menu/item-1").
 *
 * @param currentPath - Hierarchical path (e.g., "main-menu/option-1").
 * @param outsideCallback - Triggered when an interaction occurs outside the currentPath branch.
 * @param insideCallback - Triggered when an interaction occurs within the currentPath branch.
 * @param elementRef - Optional Ref to automatically assign the data-logical-path attribute.
 */
export function useScopeInteraction({
  currentPath,
  onOutside,
  onInside,
  elementRef,
}: ScopeInteractionProps) {
  // Save the callback in refs to avoid unnesseesary redefine listener if the dev uses anonymous callbacks
  const handlers = useRef({ onOutside, onInside });

  useEffect(() => {
    handlers.current = { onOutside, onInside };
  }, [onOutside, onInside]);

  useEffect(() => {
    if (elementRef?.current) {
      elementRef.current.setAttribute(INTERACTION_PATH_ATTRIBUTE_NAME, currentPath);
    }

    const handleInteraction = (event: MouseEvent | FocusEvent) => {
      // get the new focused or target element
      const target = event.target as Element;
      // search for any ancestor that is children of the current path
      const interactiveEl = target.closest(`[${INTERACTION_PATH_ATTRIBUTE_NAME}]`);
      const targetPath = interactiveEl?.getAttribute(INTERACTION_PATH_ATTRIBUTE_NAME) || '';

      // if no match, or the path is not a children of the current path take it as a focus outside
      if (!targetPath.startsWith(currentPath)) {
        handlers.current.onOutside?.(event);
      } else {
        handlers.current.onInside?.(event);
      }
    };

    document.addEventListener('mousedown', handleInteraction);
    document.addEventListener('focusin', handleInteraction);

    return () => {
      document.removeEventListener('mousedown', handleInteraction);
      document.removeEventListener('focusin', handleInteraction);
    };
  }, [currentPath, elementRef]);
}
