import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCompanion } from '../src/hooks/useCompanion';
import { emptyAiConnection } from '../src/core/ai';
import { defaultCompanionConfig } from '../src/core/companion';
import { DEFAULT_SETTINGS, emptySession } from '../src/core/types';
import type { RuntimeInfo } from '../src/core/types';

const bridge = vi.hoisted(() => ({
  configure: vi.fn(),
  status: vi.fn(),
  onAction: vi.fn(),
  stopScreen: vi.fn(),
  startScreen: vi.fn(),
  screenStatus: vi.fn(),
  analyzeScreen: vi.fn(),
  action: vi.fn(),
}));
vi.mock('../src/lib/companion', () => ({ companionRuntime: bridge }));
const status = {
  config: defaultCompanionConfig(),
  phase: 'focus',
  remainingMs: 500000,
  reason: null,
  screenSharing: false,
  gnomeConnected: false,
  placement: 'compositor',
};
const suggestion = {
  message: 'A small pause between paragraphs?',
  observation: 'A document',
  suggestBreak: false,
};
const props = (): Parameters<typeof useCompanion>[0] => ({
  settings: { ...DEFAULT_SETTINGS, overlayEnabled: true },
  session: { ...emptySession(), phase: 'focus' as const, id: 'one' },
  ai: {
    ...emptyAiConnection(),
    source: 'ollama' as const,
    connected: true,
    acknowledged: true,
    model: 'local-vision:small',
  },
  info: {
    kind: 'desktop',
    engine: 'rust',
    platform: 'linux',
    sessionType: 'wayland',
  } as RuntimeInfo,
  ready: true,
  blocked: false,
  onAction: vi.fn(),
});
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  Object.values(bridge).forEach((mock) => mock.mockReset());
  bridge.configure.mockResolvedValue(status);
  bridge.status.mockResolvedValue(status);
  bridge.onAction.mockResolvedValue(() => {});
  bridge.stopScreen.mockResolvedValue(undefined);
  bridge.screenStatus.mockResolvedValue({ supported: true, active: false, starting: false });
  bridge.startScreen.mockResolvedValue(undefined);
  bridge.analyzeScreen.mockResolvedValue(suggestion);
});
it('does not inherit a prior renderer grant or contact a model just because preferences load', async () => {
  bridge.screenStatus.mockResolvedValue({ supported: true, active: true, starting: false });
  const { result } = renderHook(() => useCompanion(props()));
  await flush(180_000);
  expect(result.current.sharing).toBe(false);
  expect(bridge.stopScreen).toHaveBeenCalled();
  expect(bridge.startScreen).not.toHaveBeenCalled();
  expect(bridge.analyzeScreen).not.toHaveBeenCalled();
});
it('automatically samples only after explicit start, with a bounded 90 second cadence', async () => {
  const { result } = renderHook(() => useCompanion(props()));
  await flush();
  await act(async () => {
    await result.current.start();
  });
  bridge.screenStatus.mockResolvedValue({ supported: true, active: true, starting: false });
  await flush(3000);
  expect(bridge.analyzeScreen).toHaveBeenCalledOnce();
  expect(result.current.advice).toEqual(suggestion);
  await flush(89_000);
  expect(bridge.analyzeScreen).toHaveBeenCalledOnce();
  await flush(1000);
  expect(bridge.analyzeScreen).toHaveBeenCalledTimes(2);
  await act(async () => {
    await result.current.stop();
  });
  expect(result.current.sharing).toBe(false);
  expect(result.current.advice).toBeNull();
  await flush(180_000);
  expect(bridge.analyzeScreen).toHaveBeenCalledTimes(2);
});
it('stopping a pending chooser prevents a late grant from restarting sampling', async () => {
  let grant!: () => void;
  bridge.startScreen.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        grant = resolve;
      }),
  );
  const { result } = renderHook(() => useCompanion(props()));
  await flush();
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.start();
  });
  expect(result.current.starting).toBe(true);
  await act(async () => {
    await result.current.stop();
    grant();
    await pending;
  });
  bridge.screenStatus.mockResolvedValue({ supported: true, active: false, starting: false });
  await flush(180_000);
  expect(result.current.sharing).toBe(false);
  expect(result.current.starting).toBe(false);
  expect(bridge.analyzeScreen).not.toHaveBeenCalled();
  expect(bridge.stopScreen).toHaveBeenCalled();
});
it('discards a model reply after Pause all and clears descriptions instead of persisting them', async () => {
  let reply!: (value: typeof suggestion) => void;
  bridge.analyzeScreen.mockImplementation(
    () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  );
  const { result } = renderHook(() => useCompanion(props()));
  await flush();
  await act(async () => {
    await result.current.start();
  });
  bridge.screenStatus.mockResolvedValue({ supported: true, active: true, starting: false });
  await flush(3000);
  expect(result.current.analyzing).toBe(true);
  act(() => window.dispatchEvent(new Event('focus:pause-sensors')));
  await act(async () => {
    reply(suggestion);
  });
  expect(result.current.sharing).toBe(false);
  expect(result.current.advice).toBeNull();
  expect(result.current.observedAt).toBeNull();
  expect(localStorage.length).toBe(0);
});
it.each(['presentation', 'model', 'session', 'overlay', 'paused', 'dialog'] as const)(
  '%s change stops sharing and never automatically reauthorizes',
  async (change) => {
    const initial = props();
    const { result, rerender } = renderHook((p) => useCompanion(p), { initialProps: initial });
    await flush();
    await act(async () => {
      await result.current.start();
    });
    if (change === 'presentation') act(() => result.current.setPresentation(true));
    if (change === 'model')
      rerender({ ...initial, ai: { ...initial.ai, model: 'different:vision' } });
    if (change === 'session') rerender({ ...initial, session: { ...initial.session, id: 'two' } });
    if (change === 'overlay')
      rerender({ ...initial, settings: { ...initial.settings, overlayEnabled: false } });
    if (change === 'paused')
      rerender({ ...initial, session: { ...initial.session, phase: 'paused' } });
    if (change === 'dialog') rerender({ ...initial, blocked: true });
    await flush();
    expect(bridge.stopScreen).toHaveBeenCalled();
    expect(result.current.sharing).toBe(false);
    expect(bridge.startScreen).toHaveBeenCalledOnce();
  },
);
it('fails safely on a missing dependency or model timeout instead of fabricating context', async () => {
  bridge.startScreen.mockRejectedValueOnce('Missing portal dependencies');
  const { result } = renderHook(() => useCompanion(props()));
  await flush();
  await act(async () => {
    await result.current.start();
  });
  expect(result.current.screenError).toContain('Missing portal');
  await act(async () => {
    await result.current.start();
  });
  bridge.screenStatus.mockResolvedValue({ supported: true, active: true, starting: false });
  bridge.analyzeScreen.mockRejectedValueOnce('Vision model timed out');
  await flush(3000);
  expect(result.current.sharing).toBe(false);
  expect(result.current.advice).toBeNull();
  expect(result.current.screenError).toContain('timed out');
});
