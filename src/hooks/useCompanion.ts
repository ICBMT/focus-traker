import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiConnection } from '../core/ai';
import { defaultCompanionConfig } from '../core/companion';
import type {
  CompanionAction,
  CompanionStatus,
  ReminderReason,
  ScreenAdvice,
} from '../core/companion';
import type { RuntimeInfo, SessionSnapshot, Settings } from '../core/types';
import { companionRuntime } from '../lib/companion';

const errorText = (error: unknown) =>
  typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : 'That desktop action could not be completed.';
export function useCompanion({
  settings,
  session,
  ai,
  info,
  ready,
  blocked,
  onAction,
}: {
  settings: Settings;
  session: SessionSnapshot;
  ai: AiConnection;
  info: RuntimeInfo;
  ready: boolean;
  blocked: boolean;
  onAction: (
    action: CompanionAction,
    advice: ScreenAdvice | null,
    reason: ReminderReason | null,
  ) => void;
}) {
  const [status, setStatus] = useState<CompanionStatus>({
    config: defaultCompanionConfig(),
    phase: session.phase,
    remainingMs: session.remainingMs,
    reason: null,
    screenSharing: false,
    gnomeConnected: false,
    placement: 'browser',
  });
  const [presentation, setPresentation] = useState(false);
  const [screenSupported, setScreenSupported] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [advice, setAdvice] = useState<ScreenAdvice | null>(null);
  const [observedAt, setObservedAt] = useState<number | null>(null);
  const [screenError, setScreenError] = useState('');
  const [error, setError] = useState('');
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const current = useRef({ session, onAction, status, blocked, presentation });
  current.current = { session, onAction, status, blocked, presentation };
  const latestAdvice = useRef(advice);
  latestAdvice.current = advice;
  const live = useRef(false);
  const opening = useRef(false);
  const generation = useRef(0);
  const modelBusy = useRef(false);
  const lastSample = useRef(0);
  const stop = useCallback(async () => {
    generation.current += 1;
    live.current = false;
    opening.current = false;
    setSharing(false);
    setStarting(false);
    setAdvice(null);
    setObservedAt(null);
    setAnalyzing(false);
    await companionRuntime.stopScreen().catch((e) => setScreenError(errorText(e)));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void companionRuntime
      .configure(
        {
          enabled: settings.overlayEnabled,
          reminders: settings.gentleReminders,
          intervalMinutes: settings.reminderMinutes,
          presentation: presentation || blocked,
          quiet: settings.protectFocus,
          theme: settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme,
          reduceMotion: settings.reduceMotion,
        },
        current.current.session,
      )
      .then((value) => {
        if (alive) {
          setStatus(value);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [
    ready,
    settings.overlayEnabled,
    settings.gentleReminders,
    settings.reminderMinutes,
    settings.protectFocus,
    settings.theme,
    settings.reduceMotion,
    systemDark,
    presentation,
    blocked,
  ]);

  useEffect(() => {
    let alive = true;
    let unlisten = () => {};
    void companionRuntime
      .onAction((action) => {
        const message = latestAdvice.current;
        const reason = current.current.status.reason;
        if (['stopSharing', 'rest', 'talk', 'disable'].includes(action)) void stop();
        current.current.onAction(action, message, reason);
        void companionRuntime
          .status(current.current.session)
          .then((value) => {
            if (alive) setStatus(value);
          })
          .catch(() => {});
      })
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    const pause = () => {
      if (live.current || opening.current) void stop();
    };
    window.addEventListener('focus:pause-sensors', pause);
    window.addEventListener('pagehide', pause);
    return () => {
      alive = false;
      unlisten();
      window.removeEventListener('focus:pause-sensors', pause);
      window.removeEventListener('pagehide', pause);
      void stop();
    };
  }, [stop]);

  useEffect(() => {
    // A changed endpoint/model/consent never inherits the previous screen grant.
    if (live.current || opening.current) void stop();
  }, [ai.port, ai.model, ai.source, ai.connected, ai.acknowledged, session.id, stop]);
  useEffect(() => {
    if (
      (presentation || blocked || !settings.overlayEnabled || session.phase !== 'focus') &&
      (live.current || opening.current)
    )
      void stop();
  }, [presentation, blocked, settings.overlayEnabled, session.phase, stop]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const [value, screen] = await Promise.all([
          companionRuntime.status(current.current.session),
          companionRuntime.screenStatus(),
        ]);
        if (!alive) return;
        setStatus(value);
        setScreenSupported(screen.supported);
        if (live.current && !screen.active) {
          void companionRuntime.stopScreen().catch(() => {});
          generation.current += 1;
          live.current = false;
          setSharing(false);
          setAdvice(null);
          setObservedAt(null);
          setAnalyzing(false);
          setScreenError('Screen sharing ended. It won’t restart without your permission.');
        }
        if (
          live.current &&
          screen.active &&
          !modelBusy.current &&
          !current.current.blocked &&
          !current.current.presentation &&
          current.current.session.phase === 'focus' &&
          Date.now() - lastSample.current >= 90_000
        ) {
          modelBusy.current = true;
          setAnalyzing(true);
          lastSample.current = Date.now();
          const token = generation.current;
          void companionRuntime
            .analyzeScreen()
            .then((result) => {
              if (alive && token === generation.current) {
                setAdvice(result);
                setObservedAt(Date.now());
                setScreenError('');
              }
            })
            .catch((e) => {
              if (alive && token === generation.current) {
                void stop();
                setScreenError(errorText(e));
              }
            })
            .finally(() => {
              modelBusy.current = false;
              if (alive && token === generation.current) setAnalyzing(false);
            });
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ready, info.kind, stop]);

  const start = async () => {
    if (opening.current || live.current) return;
    if (
      !ready ||
      blocked ||
      presentation ||
      !settings.overlayEnabled ||
      session.phase !== 'focus'
    ) {
      setScreenError('Enable the desktop timer and start a work session before sharing.');
      return;
    }
    if (!ai.acknowledged || !ai.connected || ai.source !== 'ollama' || !ai.model) {
      setScreenError('Connect an installed vision-capable model before sharing.');
      return;
    }
    const token = ++generation.current;
    opening.current = true;
    setStarting(true);
    setScreenError('');
    try {
      await companionRuntime.startScreen(ai.port, ai.model);
      if (token !== generation.current) return;
      live.current = true;
      setSharing(true);
      // Allow the portal stream to produce its first reduced-resolution frame.
      lastSample.current = Date.now() - 87_000;
    } catch (e) {
      if (token === generation.current) setScreenError(errorText(e));
    } finally {
      if (token === generation.current) {
        opening.current = false;
        setStarting(false);
      }
    }
  };
  const request = (action: CompanionAction) => {
    void companionRuntime.action(action).catch((e) => setError(errorText(e)));
  };
  return {
    status,
    presentation,
    setPresentation,
    screenSupported,
    sharing,
    starting,
    analyzing,
    advice,
    observedAt,
    screenError,
    error,
    start,
    stop,
    request,
  };
}
export type CompanionController = ReturnType<typeof useCompanion>;
