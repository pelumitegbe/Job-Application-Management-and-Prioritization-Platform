import { useRef } from 'react';

/**
 * Radix returns focus to a dialog's <Trigger> when it closes. Our dialogs are
 * often opened from ordinary buttons (row actions, toolbar buttons), which
 * Radix doesn't know about, so focus would fall back to <body>.
 *
 * Call this in a component that mounts together with the dialog content: it
 * remembers the element that had focus at that moment and returns an
 * `onCloseAutoFocus` handler that restores focus to it (if it still exists).
 */
export function useReturnFocus(onCloseAutoFocus) {
  // Read once, during the first render, before the dialog moves focus inside itself.
  const returnTo = useRef(typeof document === 'undefined' ? null : document.activeElement);

  return (event) => {
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;
    const element = returnTo.current;
    if (element && element !== document.body && element.isConnected && typeof element.focus === 'function') {
      event.preventDefault();
      element.focus();
    }
  };
}
