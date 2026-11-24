import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
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
  onCloseRequested: vi.fn(),
  onPageHide: vi.fn(),
  requestClose: vi.fn(),
  forceClose: vi.fn(),
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
  adapter.load.mockResolvedValue({
    data: { ...emptyWorkspace(), settings: { ...emptyWorkspace().settings, setupCompleted: true } },
  });
  adapter.info.mockResolvedValue({
    kind: 'web',
    engine: 'browser',
    platform: 'Browser preview',
    sessionType: 'window-only',
  });
  adapter.snapshot.mockResolvedValue(emptySession());
  adapter.save.mockResolvedValue(undefined);
  adapter.stopChat.mockResolvedValue(undefined);
  adapter.onCloseRequested.mockResolvedValue(() => {});
  adapter.onPageHide.mockReturnValue(() => {});
  adapter.requestClose.mockResolvedValue(undefined);
  adapter.forceClose.mockResolvedValue(undefined);
  adapter.pause.mockResolvedValue(emptySession());
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

describe('close-time data safety', () => {
  const requestClose = () => adapter.onCloseRequested.mock.calls.at(-1)![0]() as Promise<boolean>;
  it('flushes the newest edits and a paused checkpoint before permitting native close', async () => {
    adapter.pause.mockResolvedValue({ ...active(), phase: 'paused' });
    const { result } = renderHook(() => useWorkspace());
    await flush();
    act(() =>
      result.current.setData((old) => ({
        ...old,
        intentions: [
          { id: 'last', title: 'Last edit', mode: 'deep', completed: false, createdAt: NOW },
        ],
      })),
    );
    await act(async () => expect(await requestClose()).toBe(true));
    expect(adapter.save.mock.calls.at(-1)?.[0]).toMatchObject({
      intentions: [{ title: 'Last edit' }],
      checkpoint: { phase: 'paused', task: 'My task' },
    });
    expect(adapter.stopChat).toHaveBeenCalled();
  });
  it('keeps failed saves open and retries without losing a terminal record', async () => {
    adapter.pause.mockResolvedValue(complete());
    const { result } = renderHook(() => useWorkspace());
    await flush();
    adapter.save.mockRejectedValueOnce(new Error('Disk full'));
    await act(async () => expect(await requestClose()).toBe(false));
    expect(result.current.error).toContain('kept open');
    expect(result.current.closeBlocked).toBe(true);
    expect(adapter.forceClose).not.toHaveBeenCalled();
    expect(result.current.data.sessions).toHaveLength(1);
    expect(result.current.canSave).toBe(false);
    await act(async () => expect(await requestClose()).toBe(true));
    expect(adapter.save.mock.calls.at(-1)?.[0].sessions).toMatchObject([
      { id: 'a:focus', durationMs: 5000 },
    ]);
  });
  it('never overwrites an unreadable workspace just because the app is closing', async () => {
    adapter.load.mockResolvedValue({ data: emptyWorkspace(), readOnly: true });
    renderHook(() => useWorkspace());
    await flush();
    await act(async () => expect(await requestClose()).toBe(true));
    expect(adapter.save).not.toHaveBeenCalled();
  });
  it('preserves a deferred recovery checkpoint during close and browser pagehide', async () => {
    adapter.load.mockResolvedValue({ data: { ...emptyWorkspace(), checkpoint: active() } });
    renderHook(() => useWorkspace());
    await flush();
    const browserFinal = adapter.onPageHide.mock.calls.at(-1)![0](emptySession());
    expect(browserFinal.checkpoint?.id).toBe('a');
    await act(async () => expect(await requestClose()).toBe(true));
    expect(adapter.save.mock.calls.at(-1)?.[0].checkpoint?.id).toBe('a');
  });
  it('does not race a pending user command when close is requested', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush();
    let release!: (snapshot: SessionSnapshot) => void;
    adapter.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await act(async () => {
      const start = result.current.start({
        id: 'a',
        task: 'My task',
        mode: 'deep',
        durationMs: 60_000,
      });
      expect(await requestClose()).toBe(false);
      release(active());
      await start;
    });
    expect(adapter.pause).not.toHaveBeenCalled();
    expect(result.current.error).toContain('current action');
  });
});

it('requires an explicit user action to quit without saving after a failed close', async () => {
  adapter.pause.mockRejectedValueOnce(new Error('Engine unavailable'));
  const { result } = renderHook(() => useWorkspace());
  await flush();
  await act(async () => expect(await adapter.onCloseRequested.mock.calls.at(-1)![0]()).toBe(false));
  expect(adapter.forceClose).not.toHaveBeenCalled();
  expect(result.current.closeBlocked).toBe(true);
  await act(async () => {
    await result.current.retryClose();
  });
  expect(adapter.requestClose).toHaveBeenCalledOnce();
  await act(async () => {
    await result.current.quitWithoutSaving();
  });
  expect(adapter.forceClose).toHaveBeenCalledOnce();
});
it('retries the final save after an engine failure rather than treating it as a read-only close', async () => {
  adapter.pause.mockRejectedValueOnce(new Error('Temporary engine failure'));
  renderHook(() => useWorkspace());
  await flush();
  await act(async () => expect(await adapter.onCloseRequested.mock.calls.at(-1)![0]()).toBe(false));
  await act(async () => expect(await adapter.onCloseRequested.mock.calls.at(-1)![0]()).toBe(true));
  expect(adapter.save).toHaveBeenCalledOnce();
});

describe('failed-close user controls', () => {
  const failClose = async () => {
    adapter.save.mockRejectedValueOnce(new Error('Disk unavailable'));
    await act(async () => {
      expect(await adapter.onCloseRequested.mock.calls.at(-1)![0]()).toBe(false);
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.getByRole('dialog', { name: 'Your last changes aren’t saved yet' }),
    ).toBeVisible();
    expect(adapter.forceClose).not.toHaveBeenCalled();
  };
  const open = async () => {
    render(
      <div id="root">
        <App />
      </div>,
    );
    await flush();
  };
  it.each(['Keep open', 'Escape'])(
    '%s dismisses the failure safely, even over a nested preferences dialog',
    async (action) => {
      await open();
      fireEvent.click(screen.getByRole('button', { name: 'Your preferences' }));
      fireEvent.click(screen.getByRole('button', { name: 'Privacy & data' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
      expect(screen.getByRole('dialog', { name: 'A completely fresh start?' })).toBeVisible();
      await act(async () => {
        window.dispatchEvent(new CustomEvent('focus:companion-action', { detail: 'rest' }));
      });
      await flush();
      expect(screen.getAllByRole('dialog')).toHaveLength(1); // A desktop action cannot stack over a nested confirmation.
      await failClose();
      expect(screen.queryByRole('dialog', { name: 'A completely fresh start?' })).toBeNull();
      if (action === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
      else fireEvent.click(screen.getByRole('button', { name: action }));
      expect(
        screen.queryByRole('dialog', { name: 'Your last changes aren’t saved yet' }),
      ).toBeNull();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: 'A completely fresh start?' })).toBeVisible();
      expect(adapter.forceClose).not.toHaveBeenCalled();
      expect(adapter.reset).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Keep my data' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.getElementById('root')!.inert).toBe(false);
      expect(document.body.style.overflow).not.toBe('hidden');
      await flush();
    },
  );
  it('the Retry button sends a normal close request, not a forced exit', async () => {
    await open();
    await failClose();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save & close' }));
    await flush();
    expect(adapter.requestClose).toHaveBeenCalledOnce();
    expect(adapter.forceClose).not.toHaveBeenCalled();
  });
  it('the explicit Quit without saving button alone permits the forced exit', async () => {
    await open();
    await failClose();
    fireEvent.click(screen.getByRole('button', { name: 'Quit without saving' }));
    await flush();
    expect(adapter.forceClose).toHaveBeenCalledOnce();
    expect(adapter.requestClose).not.toHaveBeenCalled();
  });
});

describe('first-run setup orchestration', () => {
  const openFresh = async () => {
    adapter.load.mockResolvedValue({ data: emptyWorkspace() });
    const view = render(
      <div id="root">
        <App />
      </div>,
    );
    await flush();
    return view;
  };
  it('opens once, remembers completion, and goes directly to the configured timer form', async () => {
    const view = await openFresh();
    expect(screen.getByRole('dialog', { name: 'Welcome to Focus' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Setup focus duration'), { target: { value: '45' } });
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set my first timer' }));
    expect(screen.getByRole('dialog', { name: 'Make room for one thing.' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Session duration in minutes' })).toHaveValue(45);
    expect(adapter.start).not.toHaveBeenCalled();
    await flush(500);
    const saved = adapter.save.mock.calls.at(-1)![0];
    expect(saved.settings).toMatchObject({
      setupCompleted: true,
      focusMinutes: 45,
      overlayEnabled: false,
    });
    expect(JSON.stringify(saved)).not.toMatch(/screenConsent|cameraPermission|acknowledged/);
    view.unmount();
    adapter.load.mockResolvedValue({ data: saved });
    render(
      <div id="root">
        <App />
      </div>,
    );
    await flush();
    expect(screen.queryByRole('dialog', { name: 'Welcome to Focus' })).toBeNull();
  });
  it('Escape only defers setup and Preferences can reopen it', async () => {
    await openFresh();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush(500);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(adapter.save.mock.calls.at(-1)![0].settings.setupCompleted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Your preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run setup again' }));
    expect(screen.getByRole('dialog', { name: 'Welcome to Focus' })).toBeVisible();
    await flush();
  });
  it('ignores companion rest/resume actions while setup is open', async () => {
    await openFresh();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('focus:companion-action', { detail: 'rest' }));
      window.dispatchEvent(new CustomEvent('focus:companion-action', { detail: 'resume' }));
    });
    await flush();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Welcome to Focus' })).toBeVisible();
    expect(adapter.resume).not.toHaveBeenCalled();
  });
  it('does not obscure read-only recovery or an active timer on upgrade', async () => {
    adapter.load.mockResolvedValue({ data: emptyWorkspace(), readOnly: true });
    const view = render(<App />);
    await flush();
    expect(screen.queryByRole('dialog', { name: 'Welcome to Focus' })).toBeNull();
    view.unmount();
    adapter.load.mockResolvedValue({ data: { ...emptyWorkspace(), checkpoint: active() } });
    const recovery = render(<App />);
    await flush();
    expect(screen.getByRole('dialog', { name: 'Pick up where you left off?' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Welcome to Focus' })).toBeNull();
    recovery.unmount();
    adapter.load.mockResolvedValue({ data: emptyWorkspace() });
    adapter.snapshot.mockResolvedValue(active());
    render(<App />);
    await flush();
    expect(screen.queryByRole('dialog', { name: 'Welcome to Focus' })).toBeNull();
  });
  it('the save-failure dialog takes priority without losing the setup step', async () => {
    await openFresh();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    adapter.save.mockRejectedValueOnce(new Error('Disk unavailable'));
    await act(async () =>
      expect(await adapter.onCloseRequested.mock.calls.at(-1)![0]()).toBe(false),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.getByRole('dialog', { name: 'Your last changes aren’t saved yet' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));
    expect(screen.getByRole('heading', { name: 'Keep a little time within reach.' })).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(adapter.forceClose).not.toHaveBeenCalled();
  });
});
