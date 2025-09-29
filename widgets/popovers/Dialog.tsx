import React, { useEffect, useId, useRef } from 'react';
import { IconSet } from 'widgets/icons';

import 'widgets/utility/utility.scss';

export interface DialogProps {
  open: boolean;
  title: string | React.ReactNode;
  icon: JSX.Element;
  describedby?: string;
  children: React.ReactNode;
  onCancel: () => void;
  onClose?: () => void;
  className?: string;
}

export const Dialog = (props: DialogProps) => {
  const { open, title, icon, describedby, onClose, onCancel, className, children } = props;

  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }

    if (onClose) {
      element.addEventListener('close', onClose);
    }
    element.addEventListener('cancel', onCancel);

    return () => {
      if (onClose) {
        element.removeEventListener('close', onClose);
      }
      element.removeEventListener('cancel', onCancel);
    };
  }, [onClose, onCancel]);

  useEffect(() => {
    if (dialog.current) {
      open ? dialog.current.showModal() : dialog.current.close();
    }
  }, [open]);

  const handleKeyDown = useRef((event: React.KeyboardEvent<HTMLDialogElement>) => {
    event.stopPropagation();
  }).current;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={dialogTitleId}
      aria-describedby={describedby}
      onKeyDown={handleKeyDown}
      // Set classname to undefined when not opened to avoid unexpected style behavior with the closed dialog.
      className={open ? className : undefined}
    >
      <div className="dialog-header">
        <span className="dialog-icon">{icon}</span>
        <span id={dialogTitleId} className="dialog-title">
          {title}
        </span>
        <button aria-keyshortcuts="Esc" className="btn-icon dialog-close" onClick={onCancel}>
          {IconSet.CLOSE}
          <span className="visually-hidden">Close</span>
        </button>
      </div>
      {children}
    </dialog>
  );
};
