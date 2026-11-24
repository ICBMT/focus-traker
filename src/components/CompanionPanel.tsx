import { useEffect, useState } from 'react';
import { Coffee, Leaf, MessageCircle, Pause, Play, X } from 'lucide-react';
import { defaultCompanionConfig, reminderCopy } from '../core/companion';
import type { CompanionAction, CompanionStatus } from '../core/companion';
import { formatTimer } from '../core/types';
import { companionRuntime } from '../lib/companion';

export function CompanionPanel({
  status,
  nativeWindow = false,
  onAction,
}: {
  status: CompanionStatus;
  nativeWindow?: boolean;
  onAction: (action: CompanionAction) => void;
}) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!status.config.enabled || status.config.presentation) setHovered(false);
  }, [status.config.enabled, status.config.presentation]);
  const expanded = hovered || !!status.reason || status.placement === 'compositor';
  useEffect(() => {
    if (nativeWindow) void companionRuntime.expand(expanded).catch(() => {});
  }, [expanded, nativeWindow]);
  const copy = status.reason ? reminderCopy[status.reason] : null;
  const paused = ['paused', 'breakPaused'].includes(status.phase);
  return (
    <aside
      className={`corner-companion ${expanded ? 'expanded' : ''} ${nativeWindow ? 'native-companion' : ''}`}
      aria-label="Desktop timer companion"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onAction('dismiss');
          setHovered(false);
        }
      }}
    >
      {!expanded ? (
        <button
          className="corner-tab"
          aria-label={`Show timer, ${formatTimer(status.remainingMs)}${status.screenSharing ? ', screen context on' : ''}`}
          onClick={() => setHovered(true)}
        >
          <Leaf size={19} />
          <small>
            {status.screenSharing ? 'ON' : formatTimer(status.remainingMs).split(':')[0]}
          </small>
        </button>
      ) : (
        <div className="corner-content">
          <div className="corner-heading">
            <span>
              focus. <small>YOUR PACE</small>
            </span>
            <button
              aria-label="Dismiss invitation"
              onClick={() => {
                onAction('dismiss');
                setHovered(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="corner-time" aria-label={`${formatTimer(status.remainingMs)} remaining`}>
            {formatTimer(status.remainingMs)}
          </div>
          <p className="corner-title">
            {copy?.title ??
              (status.phase === 'break'
                ? 'Nothing to earn. Just a pause.'
                : paused
                  ? 'Here when you’re ready.'
                  : 'One thing at a time.')}
          </p>
          <p className="corner-detail">
            {status.message && status.reason
              ? `AI suggestion · ${status.message}`
              : (copy?.detail ?? 'A small companion. You’re in charge.')}
          </p>
          <div className="corner-actions">
            <button onClick={() => onAction('rest')}>
              <Coffee size={14} />A little rest
            </button>
            <button onClick={() => onAction('talk')}>
              <MessageCircle size={14} />
              Talk
            </button>
            {['focus', 'paused', 'break', 'breakPaused'].includes(status.phase) && (
              <button
                aria-label={paused ? 'Resume timer' : 'Pause timer'}
                onClick={() => onAction(paused ? 'resume' : 'pause')}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
            )}
          </div>
          <div className="corner-secondary">
            <button onClick={() => onAction('snooze')}>Snooze 10m</button>
            <button onClick={() => onAction('open')}>Open Focus</button>
            <button onClick={() => onAction('disable')}>Hide timer</button>
          </div>
          {status.screenSharing && (
            <button className="corner-sharing" onClick={() => onAction('stopSharing')}>
              <span className="status-dot active" />
              Screen context ON · stop sharing
            </button>
          )}
          {status.placement === 'compositor' && (
            <small className="corner-fallback">
              Window placement is controlled by Wayland. Enable the GNOME companion for corner
              hover.
            </small>
          )}
        </div>
      )}
    </aside>
  );
}

// This entry point never mounts App/useWorkspace or reads/writes stored data.
export default function CompanionWindow() {
  const [status, setStatus] = useState<CompanionStatus>({
    config: defaultCompanionConfig(),
    phase: 'idle',
    remainingMs: 0,
    reason: null,
    screenSharing: false,
    gnomeConnected: false,
    placement: 'requested',
  });
  const [error, setError] = useState('');
  useEffect(() => {
    document.body.classList.add('companion-window');
    let alive = true;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const value = await companionRuntime.status();
        if (alive) {
          setStatus(value);
          setError('');
        }
      } catch {
        if (alive) setError('Timer connection unavailable. Open Focus from your desktop.');
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      document.body.classList.remove('companion-window');
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = status.config.theme;
    document.documentElement.dataset.reduceMotion = String(status.config.reduceMotion);
  }, [status.config.theme, status.config.reduceMotion]);
  return (
    <>
      <CompanionPanel
        status={status}
        nativeWindow
        onAction={(action) =>
          void companionRuntime
            .action(action)
            .catch(() => setError('That action could not reach Focus.'))
        }
      />
      {error && (
        <p className="corner-error" role="status">
          {error}
        </p>
      )}
    </>
  );
}
