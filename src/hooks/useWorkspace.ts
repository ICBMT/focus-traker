import { useCallback, useEffect, useRef, useState } from 'react';
import { runtime } from '../lib/runtime';
import { recordsFromSnapshot, workspaceAfterSnapshot } from '../core/storage';
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
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<SessionSnapshot | null>(null);
  const recoveryRef = useRef<SessionSnapshot | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRevision = useRef(0);
  const savingPaused = useRef(false);
  const closeNeedsSave = useRef(false);
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
    setData((old) => workspaceAfterSnapshot(old, current, records));
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
      dataRef.current = next;
      closeNeedsSave.current = false;
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

  const finalWorkspace = (snapshot: SessionSnapshot): Workspace => {
    if (recoveryRef.current) return dataRef.current;
    if (seen.current.id !== snapshot.id) seen.current = { id: snapshot.id, records: new Set() };
    const records = recordsFromSnapshot(snapshot).filter(
      (record) => !seen.current.records.has(record.id),
    );
    records.forEach((record) => seen.current.records.add(record.id));
    return workspaceAfterSnapshot(dataRef.current, snapshot, records);
  };
  const closeRef = useRef<() => Promise<boolean>>(async () => false);
  closeRef.current = async () => {
    if (!ready || commandBusy.current) {
      setError('Please wait for the current action to finish, then close Focus again.');
      return false;
    }
    commandBusy.current = true;
    savingPaused.current = true;
    closeNeedsSave.current ||= canSave;
    saveRevision.current += 1;
    timerRevision.current += 1;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setBusy(true);
    window.dispatchEvent(new Event('focus:pause-sensors'));
    try {
      await runtime.stopChat().catch(() => {});
      const snapshot = await runtime.pause();
      await saveQueue.current.catch(() => {});
      const next = finalWorkspace(snapshot);
      dataRef.current = next;
      setData(next);
      setSession(snapshot);
      if (canSave || closeNeedsSave.current) {
        closeNeedsSave.current = true;
        await runtime.save(next);
        closeNeedsSave.current = false;
      }
      return true;
    } catch {
      setCanSave(false);
      setError(
        'Focus could not finish saving. The window was kept open and automatic writes are paused. Check storage, export your workspace, or retry closing.',
      );
      setCloseBlocked(true);
      return false;
    } finally {
      savingPaused.current = false;
      commandBusy.current = false;
      timerRevision.current += 1;
      setBusy(false);
    }
  };
  const pageHideRef = useRef<(snapshot: SessionSnapshot) => Workspace | null>(() => null);
  pageHideRef.current = (snapshot) => {
    window.dispatchEvent(new Event('focus:pause-sensors'));
    if (!ready || !canSave || commandBusy.current || savingPaused.current) return null;
    saveRevision.current += 1;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const next = finalWorkspace(snapshot);
    dataRef.current = next;
    return next;
  };
  useEffect(() => {
    let alive = true;
    let unlisten = () => {};
    void runtime
      .onCloseRequested(
        () => closeRef.current(),
        (message) => setError(message),
      )
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => {
        if (alive)
          setError(
            'Close-time saving could not be initialized. Keep backups of important task text.',
          );
      });
    const stopPageHide = runtime.onPageHide(
      (snapshot) => pageHideRef.current(snapshot),
      (message) => setError(message),
    );
    return () => {
      alive = false;
      unlisten();
      stopPageHide();
    };
  }, []);

  return {
    data,
    setData,
    session,
    info,
    ready,
    canSave,
    closeBlocked,
    dismissCloseFailure: () => setCloseBlocked(false),
    retryClose: () =>
      runtime
        .requestClose()
        .catch(() => setError('The close request could not be sent. Your workspace remains open.')),
    quitWithoutSaving: async () => {
      window.dispatchEvent(new Event('focus:pause-sensors'));
      void runtime.stopChat().catch(() => {});
      await runtime
        .forceClose()
        .catch(() =>
          setError(
            'The window could not be closed. Use the operating system’s normal quit controls.',
          ),
        );
    },
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
