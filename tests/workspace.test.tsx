import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from '../src/hooks/useWorkspace';
import { emptySession, emptyWorkspace } from '../src/core/types';
import type { SessionSnapshot } from '../src/core/types';

const adapter = vi.hoisted(() => ({
  load: vi.fn(),
  info: vi.fn(),
  snapshot: vi.fn(),
  save: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  finish: vi.fn(),
  reset: vi.fn(),
  restore: vi.fn(),
  stopChat: vi.fn(),
}));
vi.mock('../src/lib/runtime', () => ({ runtime: adapter }));
const NOW = Date.UTC(2026, 10, 19, 9);
const active = (): SessionSnapshot => ({
  ...emptySession(),
  id: 'a',
  phase: 'focus',
  task: 'My task',
  startedAt: NOW,
  remainingMs: 60_000,
  focusDurationMs: 60_000,
});
const complete = (): SessionSnapshot => ({
  ...active(),
  phase: 'complete',
  remainingMs: 55_000,
  focusElapsedMs: 5000,
});
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  Object.values(adapter).forEach((mock) => mock.mockReset());
  adapter.load.mockResolvedValue({ data: emptyWorkspace() });
  adapter.info.mockResolvedValue({
    kind: 'web',
    engine: 'browser',
    platform: 'Browser preview',
    sessionType: 'window-only',
  });
  adapter.snapshot.mockResolvedValue(emptySession());
  adapter.save.mockResolvedValue(undefined);
  adapter.stopChat.mockResolvedValue(undefined);
  adapter.reset.mockResolvedValue(emptySession());
  adapter.start.mockResolvedValue(active());
  adapter.finish.mockResolvedValue(complete());
});

describe('workspace persistence and command ordering', () => {
  it('never autosaves defaults over a failed initialization', async () => {
    adapter.load.mockRejectedValue(new Error('Unsupported workspace'));
    const { result } = renderHook(() => useWorkspace());
    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.canSave).toBe(false);
    await act(async () => {
      await result.current.start({ id: 'a', task: 'My task', mode: 'deep', durationMs: 60_000 });
    });
    await flush(5000);
    expect(adapter.save).not.toHaveBeenCalled();
    expect(result.current.error).toContain('not been modified');
  });
  it('honors browser read-only recovery warnings', async () => {
    adapter.load.mockResolvedValue({
      data: emptyWorkspace(),
      readOnly: true,
      warning: 'File retained',
    });
    const { result } = renderHook(() => useWorkspace());
    await flush(3000);
    expect(result.current.error).toBe('File retained');
    expect(adapter.save).not.toHaveBeenCalled();
  });
  it('does not loop or restore summaries when history is disabled', async () => {
    const data = emptyWorkspace();
    data.settings.keepHistory = false;
    adapter.load.mockResolvedValue({ data });
    adapter.snapshot.mockResolvedValue(complete());
    const { result } = renderHook(() => useWorkspace());
    await flush(5000);
    expect(result.current.data.sessions).toEqual([]);
    expect(adapter.save.mock.calls.length).toBeLessThanOrEqual(2);
    act(() => result.current.updateSettings({ keepHistory: true }));
    await flush(3000);
    expect(result.current.data.sessions).toEqual([]);
  });
  it('cannot lose a terminal record to a quick Finish then Start', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush();
    await act(async () => {
      await result.current.run(() => adapter.finish());
      await result.current.start({ id: 'b', task: 'Next task', mode: 'deep', durationMs: 60_000 });
    });
    expect(result.current.data.sessions).toMatchObject([{ id: 'a:focus', durationMs: 5000 }]);
  });
  it('ignores a stale poll that resolves after a user command', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush();
    let release!: (value: SessionSnapshot) => void;
    adapter.snapshot.mockImplementationOnce(
      () =>
        new Promise<SessionSnapshot>((resolve) => {
          release = resolve;
        }),
    );
    await flush(1000);
    await act(async () => {
      await result.current.start({ id: 'a', task: 'My task', mode: 'deep', durationMs: 60_000 });
    });
    await act(async () => {
      release(emptySession());
    });
    expect(result.current.session.phase).toBe('focus');
  });
  it('serializes user commands rather than replacing an in-flight operation', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush();
    let release!: (value: SessionSnapshot) => void;
    adapter.start.mockImplementationOnce(
      () =>
        new Promise<SessionSnapshot>((resolve) => {
          release = resolve;
        }),
    );
    let first!: Promise<SessionSnapshot | null>;
    await act(async () => {
      first = result.current.start({ id: 'a', task: 'My task', mode: 'deep', durationMs: 60_000 });
      expect(await result.current.run(() => adapter.finish())).toBeNull();
      release(active());
      await first;
    });
    expect(adapter.finish).not.toHaveBeenCalled();
    expect(result.current.session.phase).toBe('focus');
  });
  it('invalidates pending debounced writes before clearing all data', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush();
    act(() =>
      result.current.setData((old) => ({
        ...old,
        intentions: [
          {
            id: 'private',
            title: 'Do not resurrect me',
            mode: 'deep',
            completed: false,
            createdAt: NOW,
          },
        ],
      })),
    );
    await flush(100);
    await act(async () => {
      expect(await result.current.clearData(true)).toBe(true);
    });
    await flush(3000);
    expect(result.current.data).toEqual(emptyWorkspace());
    for (const [saved] of adapter.save.mock.calls)
      expect(JSON.stringify(saved)).not.toContain('Do not resurrect me');
    expect(adapter.reset).toHaveBeenCalledOnce();
  });
  it('disables automatic writes when explicit deletion fails', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush();
    adapter.save.mockRejectedValue(new Error('Disk full'));
    await act(async () => {
      expect(await result.current.clearData(true)).toBe(false);
    });
    expect(result.current.canSave).toBe(false);
    expect(result.current.error).toContain('Automatic writes are paused');
    const attempts = adapter.save.mock.calls.length;
    await flush(5000);
    expect(adapter.save).toHaveBeenCalledTimes(attempts);
  });
  it('offers recovery without automatically restarting a saved timer', async () => {
    adapter.load.mockResolvedValue({ data: { ...emptyWorkspace(), checkpoint: active() } });
    adapter.restore.mockResolvedValue({ ...active(), phase: 'paused', interrupted: true });
    const { result } = renderHook(() => useWorkspace());
    await flush(2000);
    expect(result.current.recovery?.id).toBe('a');
    expect(adapter.restore).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.recover();
    });
    expect(result.current.recovery).toBeNull();
    expect(result.current.session.phase).toBe('paused');
    expect(result.current.data.checkpoint?.phase).toBe('paused');
  });
  it('stops explicit experiments before pausing a session', async () => {
    adapter.pause.mockResolvedValue({ ...active(), phase: 'paused' });
    const pause = vi.fn();
    window.addEventListener('focus:pause-sensors', pause);
    const { result } = renderHook(() => useWorkspace());
    await flush();
    await act(async () => {
      await result.current.pauseAll();
    });
    expect(pause).toHaveBeenCalledOnce();
    expect(adapter.stopChat).toHaveBeenCalledOnce();
    expect(result.current.session.phase).toBe('paused');
    window.removeEventListener('focus:pause-sensors', pause);
  });
});
