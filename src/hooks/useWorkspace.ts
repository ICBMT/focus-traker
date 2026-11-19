import { useCallback, useEffect, useRef, useState } from 'react';
import { runtime } from '../lib/runtime';
import { recordsFromSnapshot } from '../core/storage';
import { emptySession, emptyWorkspace, isActive } from '../core/types';
import type {
  RuntimeInfo,
  SessionSnapshot,
  Settings,
  StartOptions,
  Workspace,
} from '../core/types';

export function useWorkspace() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [session, setSession] = useState<SessionSnapshot>(emptySession);
  const [info, setInfo] = useState<RuntimeInfo>({
    kind: 'web',
    engine: 'browser',
    platform: 'Browser preview',
    sessionType: 'window-only',
  });
  const [ready, setReady] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<SessionSnapshot | null>(null);
  const recoveryRef = useRef<SessionSnapshot | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRevision = useRef(0);
  const savingPaused = useRef(false);
  const commandBusy = useRef(false);
  const timerRevision = useRef(0);
  const checkpointAt = useRef(0);
  const checkpointPhase = useRef<SessionSnapshot['phase'] | null>(null);
  const seen = useRef({ id: null as string | null, records: new Set<string>() });

  // Apply terminal records at the command/poll boundary, not in a later render.
  // A quick Finish -> Start cannot lose the previous session to React batching.
  const acceptSnapshot = useCallback((current: SessionSnapshot) => {
    setSession(current);
    if (recoveryRef.current) return;
    if (seen.current.id !== current.id) seen.current = { id: current.id, records: new Set() };
    const records = recordsFromSnapshot(current).filter(
      (record) => !seen.current.records.has(record.id),
    );
    records.forEach((record) => seen.current.records.add(record.id));
    const active = isActive(current.phase);
    const phase = active ? current.phase : null;
    const due = active && Date.now() - checkpointAt.current >= 15_000;
    if (!due && phase === checkpointPhase.current && records.length === 0) return;
    checkpointPhase.current = phase;
    checkpointAt.current = Date.now();
    setData((old) => ({
      ...old,
      checkpoint: active ? { ...current } : null,
      sessions: old.settings.keepHistory
        ? [
            ...old.sessions,
            ...records.filter((record) => !old.sessions.some((saved) => saved.id === record.id)),
          ]
            .filter((record) => record.startedAt >= Date.now() - 30 * 86_400_000)
            .slice(-500)
        : [],
    }));
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [stored, details, current] = await Promise.allSettled([
        runtime.load(),
        runtime.info(),
        runtime.snapshot(),
      ]);
      if (!alive) return;
      if (details.status === 'fulfilled') setInfo(details.value);
      if (current.status === 'fulfilled') setSession(current.value);
      if (stored.status === 'fulfilled') {
        setData(stored.value.data);
        setCanSave(!stored.value.readOnly);
        if (!stored.value.data.settings.keepHistory && current.status === 'fulfilled') {
          seen.current = {
            id: current.value.id,
            records: new Set(recordsFromSnapshot(current.value).map((record) => record.id)),
          };
        }
        checkpointPhase.current = stored.value.data.checkpoint?.phase ?? null;
        if (
          stored.value.data.checkpoint &&
          (current.status !== 'fulfilled' || !isActive(current.value.phase))
        ) {
          recoveryRef.current = stored.value.data.checkpoint;
          setRecovery(stored.value.data.checkpoint);
        }
        if (stored.value.warning) setError(stored.value.warning);
      } else {
        // Never autosave defaults over an unreadable/unsupported workspace.
        setCanSave(false);
        setError(
          'Saved data could not be read and has not been modified. This workspace is temporary until you explicitly reset it.',
        );
      }
      if (current.status === 'rejected')
        setError('The session engine could not be reached. Local data has not been changed.');
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !canSave || savingPaused.current) return;
    const revision = saveRevision.current;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(async () => {
          if (revision !== saveRevision.current || savingPaused.current) return;
          await runtime.save(data);
        })
        .catch(() =>
          setError(
            'Could not save locally. Your running session is unaffected. Check available storage.',
          ),
        );
    }, 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, ready, canSave]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let polling = false;
    const tick = async () => {
      if (polling || commandBusy.current) return;
      polling = true;
      const revision = timerRevision.current;
      try {
        const current = await runtime.snapshot();
        if (alive && revision === timerRevision.current) acceptSnapshot(current);
      } catch {
        if (alive)
          setError(
            'The session engine could not be reached. No sensor or enforcement action will be taken.',
          );
      } finally {
        polling = false;
      }
    };
    const timer = setInterval(tick, 1000);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ready, acceptSnapshot]);

  useEffect(() => {
    const active = session.phase === 'focus' || session.phase === 'break';
    document.title = active
      ? `${Math.ceil(session.remainingMs / 60_000)}m · ${session.phase === 'focus' ? 'Focus' : 'Take a breath'} — Focus`
      : 'Focus — a little more present';
  }, [session.phase, session.remainingMs]);

  const run = useCallback(
    async (operation: () => Promise<SessionSnapshot>) => {
      if (commandBusy.current) return null;
      commandBusy.current = true;
      setBusy(true);
      timerRevision.current += 1;
      try {
        const next = await operation();
        acceptSnapshot(next);
        return next;
      } catch (e) {
        setError(
          typeof e === 'string'
            ? e
            : e instanceof Error
              ? e.message
              : 'That action could not be completed. Please try again.',
        );
        return null;
      } finally {
        timerRevision.current += 1;
        commandBusy.current = false;
        setBusy(false);
      }
    },
    [acceptSnapshot],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((old) => ({
      ...old,
      settings: { ...old.settings, ...patch },
      sessions: patch.keepHistory === false ? [] : old.sessions,
    }));
  }, []);

  const start = (options: StartOptions) => run(() => runtime.start(options));
  const pauseAll = async () => {
    window.dispatchEvent(new Event('focus:pause-sensors'));
    await runtime.stopChat().catch(() => {});
    return run(() => runtime.pause());
  };
  const recover = async () => {
    if (!recoveryRef.current) return;
    const saved = recoveryRef.current;
    const result = await run(() => runtime.restore(saved));
    if (result) {
      recoveryRef.current = null;
      setRecovery(null);
      acceptSnapshot(result);
    }
  };
  const discardRecovery = () => {
    recoveryRef.current = null;
    setRecovery(null);
    checkpointPhase.current = null;
    setData((old) => ({ ...old, checkpoint: null }));
  };

  const clearData = async (all: boolean): Promise<boolean> => {
    if (commandBusy.current) return false;
    commandBusy.current = true;
    savingPaused.current = true;
    saveRevision.current += 1;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setBusy(true);
    timerRevision.current += 1;
    window.dispatchEvent(new Event('focus:pause-sensors'));
    try {
      await runtime.stopChat().catch(() => {});
      await saveQueue.current.catch(() => {});
      const reset = await runtime.reset();
      setSession(reset);
      const next = all ? emptyWorkspace() : { ...dataRef.current, sessions: [], checkpoint: null };
      await runtime.save(next);
      seen.current = { id: null, records: new Set() };
      recoveryRef.current = null;
      checkpointPhase.current = null;
      checkpointAt.current = 0;
      setData(next);
      setRecovery(null);
      setCanSave(true);
      setError('');
      return true;
    } catch {
      setCanSave(false);
      setError(
        'Could not clear local data. Automatic writes are paused to protect the existing workspace. Check storage permissions before retrying.',
      );
      return false;
    } finally {
      timerRevision.current += 1;
      savingPaused.current = false;
      commandBusy.current = false;
      setBusy(false);
    }
  };

  return {
    data,
    setData,
    session,
    info,
    ready,
    canSave,
    error,
    setError,
    busy,
    recovery,
    recover,
    discardRecovery,
    start,
    run,
    pauseAll,
    updateSettings,
    clearData,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspace>;
