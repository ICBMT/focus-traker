import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupWizard from '../src/components/SetupWizard';
import type { SetupResult } from '../src/components/SetupWizard';
import ModelSetup from '../src/components/ModelSetup';
import { emptyAiConnection } from '../src/core/ai';
import { defaultCompanionConfig } from '../src/core/companion';
import { DEFAULT_SETTINGS, emptySession } from '../src/core/types';
import type { RuntimeInfo, Settings } from '../src/core/types';
import type { CompanionController } from '../src/hooks/useCompanion';

const adapter = vi.hoisted(() => ({ models: vi.fn(), installGnome: vi.fn() }));
vi.mock('../src/lib/runtime', () => ({ runtime: { models: adapter.models } }));
vi.mock('../src/lib/companion', () => ({
  companionRuntime: { installGnome: adapter.installGnome },
}));
const web: RuntimeInfo = {
  kind: 'web',
  platform: 'Browser preview',
  engine: 'browser',
  sessionType: 'window-only',
};
const linux: RuntimeInfo = {
  kind: 'desktop',
  platform: 'linux',
  engine: 'rust',
  sessionType: 'wayland',
};
const activity = vi.fn();
const notice = vi.fn();
const changed = vi.fn();
const capture = vi.fn();
const controller = (): CompanionController => ({
  status: {
    config: defaultCompanionConfig(),
    phase: 'idle',
    remainingMs: 1_500_000,
    reason: null,
    screenSharing: false,
    gnomeConnected: false,
    placement: 'browser',
  },
  presentation: false,
  setPresentation: vi.fn(),
  screenSupported: true,
  sharing: false,
  starting: false,
  analyzing: false,
  advice: null,
  observedAt: null,
  screenError: '',
  error: '',
  start: vi.fn(),
  stop: vi.fn(),
  request: vi.fn(),
});
function Harness({
  info = web,
  onFinish = vi.fn(),
  onDismiss = vi.fn(),
  initial = {},
  modelOnly = false,
}: {
  info?: RuntimeInfo;
  onFinish?: (result: SetupResult) => void;
  onDismiss?: () => void;
  initial?: Partial<Settings>;
  modelOnly?: boolean;
}) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...initial });
  const [ai, setAi] = useState(emptyAiConnection);
  const onChange = (patch: Partial<typeof ai>) => {
    changed(patch);
    setAi((old) => ({ ...old, ...patch }));
  };
  return modelOnly ? (
    <ModelSetup ai={ai} info={info} onChange={onChange} onNotice={notice} />
  ) : (
    <SetupWizard
      settings={settings}
      info={info}
      ai={ai}
      companion={controller()}
      session={emptySession()}
      canSave
      onUpdate={(patch) => setSettings((old) => ({ ...old, ...patch }))}
      onAiChange={onChange}
      onNotice={notice}
      onActivity={activity}
      onFinish={onFinish}
      onDismiss={onDismiss}
    />
  );
}
function next(times = 1) {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}
const fakeStream = () => {
  const stop = vi.fn();
  const track = { stop, onended: null };
  return {
    stop,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  };
};
beforeEach(() => {
  Object.values(adapter).forEach((mock) => mock.mockReset());
  activity.mockClear();
  notice.mockClear();
  changed.mockClear();
  capture.mockReset();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: capture },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

describe('first-run permission walkthrough', () => {
  it('starts without any device, model or installation request; keeps earlier choices on Back', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: 'Welcome to Focus' })).toBeVisible();
    expect(screen.getByText(/No special permissions needed to begin/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Setup focus duration'), { target: { value: '45' } });
    next();
    expect(screen.getByRole('switch', { name: 'Desktop corner timer' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Setup focus duration')).toHaveValue('45');
    expect(capture).not.toHaveBeenCalled();
    expect(adapter.models).not.toHaveBeenCalled();
    expect(adapter.installGnome).not.toHaveBeenCalled();
  });
  it('can skip or close setup without granting optional access', () => {
    const finish = vi.fn(),
      dismiss = vi.fn();
    render(<Harness onFinish={finish} onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(finish).toHaveBeenCalledWith({ startTimer: false, screenGuide: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
    expect(adapter.models).not.toHaveBeenCalled();
  });
  it('finishes with an honest off/unavailable summary and a direct first-timer action', () => {
    const finish = vi.fn();
    render(<Harness onFinish={finish} />);
    next(4);
    expect(screen.getByText('Offline guidance · ready')).toBeVisible();
    expect(screen.getByText('Unavailable on this platform')).toBeVisible();
    expect(screen.getByText('Off · not tested (optional)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Set my first timer' }));
    expect(finish).toHaveBeenCalledWith({ startTimer: true, screenGuide: false });
    expect(capture).not.toHaveBeenCalled();
    expect(adapter.models).not.toHaveBeenCalled();
  });
  it('uses an inline GNOME confirmation, not a second dialog or automatic installation', async () => {
    adapter.installGnome.mockResolvedValue('Files installed. Enable the extension yourself.');
    render(<Harness info={linux} />);
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Install GNOME companion…' }));
    expect(adapter.installGnome).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Install bundled files' }));
    await screen.findByText('Files installed. Enable the extension yourself.');
    expect(adapter.installGnome).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
  });
  it.each(['windows', 'macos'])(
    'does not offer nonexistent screen or GNOME permission on %s',
    (platform) => {
      render(<Harness info={{ ...linux, platform, sessionType: 'desktop' }} />);
      next();
      expect(screen.queryByRole('button', { name: 'Install GNOME companion…' })).toBeNull();
      next(2);
      expect(screen.getByText('Unavailable here')).toBeVisible();
      expect(
        screen.getByText(/No microphone, notification-source access, autostart/),
      ).toBeVisible();
      expect(capture).not.toHaveBeenCalled();
    },
  );
  it('never pre-grants Linux screen context, even after the setup steps', () => {
    render(<Harness info={linux} />);
    next(3);
    expect(screen.getByText('Ask each work session')).toBeVisible();
    expect(screen.getByText(/Not granted by setup/)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Show me screen-sharing setup/ })).toBeDisabled();
    next();
    expect(screen.getByText('Off · choose a source per session')).toBeVisible();
  });
  it('can offer a one-time screen-setup shortcut without requesting screen access', async () => {
    adapter.models.mockResolvedValue([{ name: 'local:vision-candidate', size: 0 }]);
    const finish = vi.fn();
    const user = userEvent.setup();
    render(<Harness info={linux} initial={{ overlayEnabled: true }} onFinish={finish} />);
    next(2);
    await user.click(screen.getByRole('checkbox', { name: /loopback server/ }));
    await user.click(screen.getByRole('button', { name: 'Discover installed models' }));
    await screen.findByRole('option', { name: /vision-candidate/ });
    next();
    const guide = screen.getByRole('checkbox', { name: /Show me screen-sharing setup/ });
    expect(guide).toBeEnabled();
    await user.click(guide);
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Set my first timer' }));
    expect(finish).toHaveBeenCalledWith({ startTimer: true, screenGuide: true });
    expect(capture).not.toHaveBeenCalled();
    expect(screen.getByText('Off · choose a source per session')).toBeVisible();
  });
  it('gates the optional camera test and stops its stream when leaving the step', async () => {
    const fake = fakeStream();
    capture.mockResolvedValue(fake.stream);
    const user = userEvent.setup();
    render(<Harness />);
    next(3);
    await user.click(screen.getByText('Try camera access (optional)'));
    expect(screen.getByRole('button', { name: 'Test camera access' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I want to test a live/ }));
    expect(capture).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Test camera access' }));
    await screen.findByRole('button', { name: 'Stop camera test' });
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    next();
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(screen.getByText('Off · preview checked this setup')).toBeVisible();
  });
  it('camera denial is explained and never prevents continuing to the timer', async () => {
    capture.mockRejectedValue(new DOMException('Declined', 'NotAllowedError'));
    const user = userEvent.setup();
    render(<Harness />);
    next(3);
    await user.click(screen.getByText('Try camera access (optional)'));
    await user.click(screen.getByRole('checkbox', { name: /I want to test a live/ }));
    await user.click(screen.getByRole('button', { name: 'Test camera access' }));
    await screen.findByText(/Camera access was not granted/);
    next();
    expect(screen.getByText('Off · test unavailable/declined')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Set my first timer' })).toBeEnabled();
  });
  it('stops a camera permission reply that arrives after the wizard step unmounts', async () => {
    let release!: (stream: MediaStream) => void;
    capture.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const fake = fakeStream();
    const user = userEvent.setup();
    render(<Harness />);
    next(3);
    await user.click(screen.getByText('Try camera access (optional)'));
    await user.click(screen.getByRole('checkbox', { name: /I want to test a live/ }));
    await user.click(screen.getByRole('button', { name: 'Test camera access' }));
    next();
    await act(async () => release(fake.stream));
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(screen.getByText('Off · not tested (optional)')).toBeVisible();
  });
});

describe('shared model setup lifecycle', () => {
  it('requires the routing acknowledgement and handles discovery without downloading', async () => {
    adapter.models.mockResolvedValue([{ name: 'local:small', size: 1_000_000 }]);
    const user = userEvent.setup();
    render(<Harness modelOnly info={linux} />);
    expect(screen.getByRole('button', { name: 'Discover installed models' })).toBeDisabled();
    expect(adapter.models).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /loopback server/ }));
    await user.click(screen.getByRole('button', { name: 'Discover installed models' }));
    await screen.findByRole('option', { name: /local:small/ });
    expect(adapter.models).toHaveBeenCalledWith(11434);
    expect(screen.getByRole('button', { name: /^Local Ollama/ })).toHaveClass('selected');
  });
  it('ignores a model reply after switching back to offline guidance', async () => {
    let release!: (models: { name: string; size: number }[]) => void;
    adapter.models.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<Harness modelOnly info={linux} />);
    await user.click(screen.getByRole('checkbox', { name: /loopback server/ }));
    await user.click(screen.getByRole('button', { name: 'Discover installed models' }));
    await user.click(screen.getByRole('button', { name: /^Offline guidance/ }));
    const calls = changed.mock.calls.length;
    await act(async () => release([{ name: 'late:model', size: 0 }]));
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole('button', { name: /^Offline guidance/ })).toHaveClass('selected');
    expect(screen.queryByRole('option', { name: /late:model/ })).toBeNull();
  });
  it('ignores discovery after leaving setup and surfaces connection failures safely', async () => {
    adapter.models.mockRejectedValueOnce(new Error('Ollama is unavailable.'));
    const user = userEvent.setup();
    const view = render(<Harness modelOnly info={linux} />);
    await user.click(screen.getByRole('checkbox', { name: /loopback server/ }));
    await user.click(screen.getByRole('button', { name: 'Discover installed models' }));
    await screen.findByText('Ollama is unavailable.');
    expect(screen.getByRole('button', { name: /^Offline guidance/ })).toHaveClass('selected');
    let release!: (models: { name: string; size: number }[]) => void;
    adapter.models.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await user.click(screen.getByRole('button', { name: 'Discover installed models' }));
    view.unmount();
    const calls = changed.mock.calls.length;
    await act(async () => release([{ name: 'late:model', size: 0 }]));
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(notice).not.toHaveBeenCalled();
  });
  it('validates a port before contacting the native host', async () => {
    const user = userEvent.setup();
    render(<Harness modelOnly info={linux} />);
    await user.click(screen.getByRole('checkbox', { name: /loopback server/ }));
    fireEvent.change(screen.getByLabelText('Ollama port'), { target: { value: '65536' } });
    await user.click(screen.getByRole('button', { name: 'Discover installed models' }));
    await waitFor(() =>
      expect(screen.getByText('Choose a port between 1 and 65535.')).toBeVisible(),
    );
    expect(adapter.models).not.toHaveBeenCalled();
  });
});
