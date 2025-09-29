import React, { useLayoutEffect } from 'react';
import { Placement, Strategy, VirtualElement } from '@floating-ui/core';

import { usePopover } from './usePopover';

export interface FlyoutProps {
  isOpen: boolean;
  label?: string;
  labelledby?: string;
  describedby?: string;
  target: (
    ref: (element: Element | VirtualElement | null) => void,
  ) => React.ReactElement<HTMLElement>;
  /** The popover content. */
  children: React.ReactNode;
  /** Closes the flyout when the `Escape` key is pressed or clicked outside. */
  cancel: () => void;
  /** When this specific element is focused, the FlyOut is not closed */
  ignoreCloseForElementOnBlur?: HTMLElement;
  placement?: Placement;
  fallbackPlacements?: Placement[];
  strat?: Strategy;
  updateDependency?: any;
}

/**
 * A dismissable dialog modal
 */
export const Flyout = (props: FlyoutProps) => {
  const {
    isOpen,
    label,
    labelledby,
    describedby,
    cancel,
    ignoreCloseForElementOnBlur,
    target,
    children,
    placement,
    fallbackPlacements,
    strat,
    updateDependency = children,
  } = props;
  const { style, reference, floating, update } = usePopover(placement, fallbackPlacements, strat);

  useLayoutEffect(() => {
    if (isOpen) {
      update();
    }
  }, [isOpen, update, updateDependency]);

  const handleBlur = (e: React.FocusEvent) => {
    if (e.relatedTarget === ignoreCloseForElementOnBlur) {
      return;
    }
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      cancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
      // Returns focus to the `target` element.
      (e.currentTarget.previousElementSibling as HTMLElement).focus();
    }
  };

  return (
    <>
      {target(reference)}
      <div
        ref={floating}
        style={style}
        data-open={isOpen}
        data-popover
        role="dialog"
        aria-modal={true}
        data-flyout
        aria-label={label}
        aria-labelledby={labelledby}
        aria-describedby={describedby}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </>
  );
};

export default Flyout;
