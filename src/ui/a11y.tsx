import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (backwards) return current <= 0 ? count - 1 : current - 1;
  return current >= count - 1 ? 0 : current + 1;
}

export function DialogSurface({
  children, label, labelledBy, onClose, style, className,
}: {
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  onClose?: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? ref.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      previous?.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const focusable = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (focusable.length === 0) {
      event.preventDefault();
      ref.current?.focus();
      return;
    }
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = nextFocusIndex(current, focusable.length, event.shiftKey);
    if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === focusable.length - 1)) {
      event.preventDefault();
      focusable[next]?.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return <span id={id} style={visuallyHiddenStyle}>{children}</span>;
}

export const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
};
