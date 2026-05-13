import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
import FocusManager from 'src/frontend/FocusManager';
import { IconSet } from 'widgets/icons';
import { Toolbar } from './toolbar';
import { ScopeInteractionProps, useScopeInteraction } from 'src/frontend/hooks/useScopeInteraction';

interface IFloatingPanelProps {
  id: string;
  type?: string;
  title?: string;
  className?: string;
  onBlur: () => void;
  ignoreOnBlur?: (e: MouseEvent | FocusEvent) => boolean;
  onToggleDock: () => void;
  children: ReactNode;
  dataOpen: boolean;
  isDocked: boolean;
}

export const FloatingPanel = (props: IFloatingPanelProps) => {
  const {
    id,
    type,
    title,
    className,
    onBlur,
    ignoreOnBlur,
    onToggleDock,
    dataOpen,
    isDocked,
    children,
  } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const dockingRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && !isDocked) {
        e.stopPropagation();
        onBlur();
        FocusManager.focusGallery();
      }
    },
    [isDocked, onBlur],
  );

  const handleSwitchToSide = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleDock();
    },
    [onToggleDock],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.setAttribute('data-animate-flash', 'false');
      requestAnimationFrame(() => {
        panel.setAttribute('data-animate-flash', 'true');
      });
    }
  }, [type]);

  useEffect(() => {
    const panel = panelRef.current;
    const dockDiv = dockingRef.current;
    if (!dataOpen || !panel || !dockDiv || !hasMounted.current) {
      return;
    }
    if (isDocked) {
      animateFloatingToDocking(panel, dockDiv);
    } else {
      animateDockingToFloating(panel, dockDiv);
    }
  }, [isDocked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.setAttribute('data-docked', isDocked ? 'true' : 'false');
    }
    hasMounted.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur: ScopeInteractionProps['onOutside'] = useCallback(
    (e: MouseEvent | FocusEvent) => {
      if (!isDocked && dataOpen && !(ignoreOnBlur ? ignoreOnBlur(e) : false)) {
        onBlur();
        FocusManager.focusGallery();
      }
    },
    [dataOpen, ignoreOnBlur, isDocked, onBlur],
  );

  useScopeInteraction({
    currentPath: 'floating-panel',
    onOutside: handleBlur,
    elementRef: panelRef,
  });

  return (
    <div ref={dockingRef} id={id} className={className}>
      <div
        ref={panelRef}
        data-popover
        data-open={dataOpen}
        data-animate-flash={dataOpen}
        className={'floating-panel'}
        tabIndex={-1} //necessary for handling the onblur correctly
        //onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        <header onClick={onBlur} id={`${id}-header`}>
          <h2>{title}</h2>
          <Toolbar controls={id} isCompact>
            <button
              className="floating-switch-side-button"
              data-tooltip="Switch to/from the side"
              onClick={handleSwitchToSide}
              aria-haspopup="menu"
              style={isDocked ? undefined : { transform: 'scaleX(-1)' }}
            >
              {IconSet.ARROW_RIGHT}
            </button>
          </Toolbar>
        </header>
        {dataOpen ? children : null}
      </div>
    </div>
  );
};

function animateDockingToFloating(panel: HTMLElement, DockContainer: HTMLElement) {
  const rect = DockContainer.getBoundingClientRect();
  panel.setAttribute('data-animate-flash', 'false');
  panel.setAttribute(
    'style',
    `
    position: fixed;
    top: ${0}px;
    left: ${0}px;
    width: ${rect.width}px;
    transform: translate(${rect.left}px, ${rect.top}px);
  `,
  );
  requestAnimationFrame(() => {
    panel.setAttribute('data-docked', 'false');
    panel.removeAttribute('style');
  });
}

function animateFloatingToDocking(panel: HTMLElement, DockContainer: HTMLElement) {
  const rect = DockContainer.getBoundingClientRect();
  panel.setAttribute('data-animate-flash', 'false');
  requestAnimationFrame(() => {
    panel.setAttribute(
      'style',
      `
      position: fixed;
      top: ${0}px;
      left: ${0}px;
      width: ${rect.width}px;
      transform: translate(${rect.left}px, ${rect.top}px);
    `,
    );
    panel.removeAttribute('data-docked');
    const onTransitionEnd = () => {
      panel.setAttribute('data-docked', 'true');
      panel.removeAttribute('style');
    };
    panel.addEventListener('transitionend', onTransitionEnd, { once: true });
  });
}
