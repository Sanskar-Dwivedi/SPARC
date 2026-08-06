/* A sheet that rises over the map instead of replacing it.
 *
 * The evidence for a measurement used to be a separate screen you navigated to,
 * which meant losing sight of the place the measurement is about. Here it slides
 * up over the atlas and the map stays behind it — you can close it and still be
 * exactly where you were, at the same zoom, on the same indicator.
 *
 * Escape closes it, focus moves in on open and returns to the control that
 * opened it, and it is `aria-hidden` while closed so a screen reader never
 * walks into a panel that is off-screen.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    requestAnimationFrame(() => panel.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <>
      <div className={`prov-scrim${open ? ' prov-scrim--open' : ''}`} onMouseDown={onClose} aria-hidden="true" />
      <section
        ref={panel}
        tabIndex={-1}
        className={`sheet${open ? ' sheet--open' : ''}`}
        role="dialog"
        aria-label={title}
        aria-hidden={open ? undefined : true}
      >
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button type="button" className="sheet__x" onClick={onClose} aria-label={`Close ${title}`}>×</button>
        </div>
        <div className="sheet__body">{children}</div>
      </section>
    </>,
    document.body,
  );
}
