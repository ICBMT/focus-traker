import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Leaf, X } from 'lucide-react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { formatTimer } from '../core/types';

export function Button({
  children,
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={`button button-${variant} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Pill({
  children,
  tone = 'green',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'green' | 'neutral' | 'amber';
  dot?: boolean;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}
// A failed native close must take precedence over every dialog, including
// dialogs owned by nested pages. Suppression unmounts their focus/keyboard
// surface without discarding the parent's draft/consent state.
export const ModalSuppressionContext = createContext(false);
type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  eyebrow?: string;
  className?: string;
};
export function Modal({ priority = false, ...props }: ModalProps & { priority?: boolean }) {
  const suppressed = useContext(ModalSuppressionContext);
  return suppressed && !priority ? null : <ModalSurface {...props} />;
}
function ModalSurface({ title, children, onClose, eyebrow, className = '' }: ModalProps) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      (container.current?.querySelector('[data-autofocus]') as HTMLElement | null)?.focus();
      if (!container.current?.contains(document.activeElement)) container.current?.focus();
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const elements = [
          ...(container.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ].filter((el) => !el.hidden);
        if (!elements.length) {
          event.preventDefault();
          return;
        }
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === container.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === container.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', key);
      if (root) root.inert = wasInert;
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className={`modal-backdrop ${className}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={container}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id={id}>{title}</h2>
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <span className="empty-icon">
        <Leaf size={23} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" type="button" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}

export function TimerDial({
  remainingMs,
  progress,
  label = 'AT YOUR OWN PACE',
  large = false,
  resting = false,
}: {
  remainingMs: number;
  progress: number;
  label?: string;
  large?: boolean;
  resting?: boolean;
}) {
  const fraction = Math.min(1, Math.max(0, progress));
  return (
    <div
      className={`timer-dial ${large ? 'large' : ''} ${resting ? 'resting' : ''}`}
      style={{ '--progress': fraction } as CSSProperties}
    >
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <circle cx="130" cy="130" r="119" className="timer-outer" />
        {Array.from({ length: 60 }, (_, i) => {
          const angle = (i * Math.PI) / 30;
          const inner = i % 5 === 0 ? 109 : 112;
          return (
            <line
              key={i}
              x1={130 + Math.sin(angle) * inner}
              y1={130 - Math.cos(angle) * inner}
              x2={130 + Math.sin(angle) * 116}
              y2={130 - Math.cos(angle) * 116}
              className={i % 5 === 0 ? 'major-tick' : 'minor-tick'}
            />
          );
        })}
        <circle cx="130" cy="130" r="98" className="timer-track" />
        <circle
          cx="130"
          cy="130"
          r="98"
          className="timer-progress"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - fraction * 100}
          transform="rotate(-90 130 130)"
        />
      </svg>
      <div className="timer-center">
        <Leaf size={19} strokeWidth={1.6} />
        <span
          className="timer-time"
          aria-label={`${formatTimer(remainingMs)} remaining`}
          data-testid="session-timer"
        >
          {formatTimer(remainingMs)}
        </span>
        <span className="timer-label">{label}</span>
      </div>
    </div>
  );
}

export function Botanical({ variant = 'plant' }: { variant?: 'plant' | 'sprout' }) {
  return (
    <svg
      className={`botanical botanical-${variant}`}
      viewBox="0 0 300 210"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="151" cy="107" r="90" fill="currentColor" opacity=".14" />
      <circle cx="151" cy="107" r="69" stroke="currentColor" opacity=".1" />
      <path
        d="M143 190c14-45-10-98 18-156"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M150 142c-32-2-54-22-48-47 29-1 48 19 48 47Z" fill="currentColor" opacity=".25" />
      <path d="M151 116c3-34 21-56 46-53 0 27-16 50-46 53Z" fill="currentColor" opacity=".65" />
      <path d="M151 86c-29-2-45-17-41-41 26-1 43 15 41 41Z" fill="currentColor" opacity=".4" />
      <path d="M158 58c-5-28 7-48 28-50 8 23-3 43-28 50Z" fill="currentColor" opacity=".72" />
      <path d="M146 163c17-29 38-36 59-21-10 22-30 30-59 21Z" fill="currentColor" opacity=".4" />
      <path d="M119 207c24-8 48-9 73-3" stroke="currentColor" strokeWidth="1.3" opacity=".3" />
      <path
        d="m184 29-22 29m-45-7 31 33m41-12-34 39m-46-9 39 35m45 10-44 14"
        stroke="#f4f6ed"
        strokeWidth="1"
        opacity=".7"
      />
      <circle cx="68" cy="115" r="3" fill="currentColor" opacity=".3" />
      <circle cx="221" cy="55" r="2" fill="currentColor" opacity=".4" />
      <path d="M227 116v10m-5-5h10" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
      <path d="M77 55v7m-3.5-3.5h7" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
    </svg>
  );
}
