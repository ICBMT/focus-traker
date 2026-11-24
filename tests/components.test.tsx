import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal, Toggle } from '../src/components/ui';
import { SessionCard, WeekChart } from '../src/components/Dashboard';
import Sensors from '../src/components/Sensors';
import RestGarden from '../src/components/RestGarden';
import { DEFAULT_SETTINGS, emptySession } from '../src/core/types';
import type { RuntimeInfo } from '../src/core/types';
import { nativeScripts } from '../scripts/webdriver-scripts.mjs';

const adapter = vi.hoisted(() => ({ rhythm: vi.fn() }));
vi.mock('../src/lib/runtime', () => ({ runtime: adapter }));
const info: RuntimeInfo = {
  kind: 'web',
  engine: 'browser',
  platform: 'Browser preview',
  sessionType: 'window-only',
};
beforeEach(() => {
  adapter.rhythm.mockResolvedValue({ status: 'unknown', reason: 'More input is needed.' });
});

it('provides a labeled keyboard-accessible switch', async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(<Toggle checked={false} label="A deliberate choice" onChange={change} />);
  const toggle = screen.getByRole('switch', { name: 'A deliberate choice' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  await user.click(toggle);
  expect(change).toHaveBeenCalledWith(true);
});

it('traps dialog focus, handles Escape, and restores the opener', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  const opener = document.createElement('button');
  opener.textContent = 'Opener';
  document.body.append(opener);
  opener.focus();
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  const view = render(
    <Modal title="A safe space" onClose={close}>
      <input data-autofocus aria-label="Your intention" />
      <button>Last control</button>
    </Modal>,
  );
  await waitFor(() => expect(screen.getByLabelText('Your intention')).toHaveFocus());
  expect(root.inert).toBe(true);
  screen.getByRole('button', { name: 'Last control' }).focus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(opener).toHaveFocus();
  expect(root.inert).toBe(false);
  opener.remove();
  root.remove();
});

it('offers a no-break exit when a work timer is complete', () => {
  const callbacks = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onFinish: vi.fn(),
    onBreak: vi.fn(),
    onProtect: vi.fn(),
  };
  render(
    <SessionCard
      session={{ ...emptySession(), phase: 'breakReady', id: 'a', task: 'A task', remainingMs: 0 }}
      settings={DEFAULT_SETTINGS}
      busy={false}
      {...callbacks}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Done for now' }));
  expect(callbacks.onFinish).toHaveBeenCalledOnce();
  expect(callbacks.onBreak).not.toHaveBeenCalled();
});

describe('camera lifecycle with a synthetic stream (not hardware validation)', () => {
  function setup(capture: () => Promise<MediaStream>) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(capture) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const view = render(<Sensors info={info} onActivity={vi.fn()} onNotice={vi.fn()} />);
    return { ...view, user: userEvent.setup(), capture: navigator.mediaDevices.getUserMedia };
  }
  const fakeStream = () => {
    const stop = vi.fn();
    const track = { stop, onended: null };
    return {
      stop,
      stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
    };
  };
  it('does not request a camera before both deliberate consent actions', async () => {
    const fake = fakeStream();
    const view = setup(async () => fake.stream);
    expect(view.capture).not.toHaveBeenCalled();
    await view.user.click(screen.getByRole('button', { name: 'Try camera preview' }));
    expect(view.capture).not.toHaveBeenCalled();
    await view.user.click(screen.getByRole('button', { name: 'Start camera preview' }));
    await screen.findByRole('button', { name: 'Stop camera' });
    expect(view.capture).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    view.unmount();
    expect(fake.stop).toHaveBeenCalledOnce();
  });
  it('stops and clears a live stream when Pause all is used', async () => {
    const fake = fakeStream();
    const view = setup(async () => fake.stream);
    await view.user.click(screen.getByRole('button', { name: 'Try camera preview' }));
    await view.user.click(screen.getByRole('button', { name: 'Start camera preview' }));
    await screen.findByRole('button', { name: 'Stop camera' });
    act(() => {
      window.dispatchEvent(new Event('focus:pause-sensors'));
    });
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Your live camera preview')).toHaveProperty('srcObject', null);
  });
  it('stops the live preview when the page becomes hidden', async () => {
    const fake = fakeStream();
    const view = setup(async () => fake.stream);
    await view.user.click(screen.getByRole('button', { name: 'Try camera preview' }));
    await view.user.click(screen.getByRole('button', { name: 'Start camera preview' }));
    await screen.findByRole('button', { name: 'Stop camera' });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Try camera preview' })).toBeInTheDocument();
  });
  it('stops a permission result that arrives after leaving the sensor page', async () => {
    let release!: (stream: MediaStream) => void;
    const fake = fakeStream();
    const view = setup(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await view.user.click(screen.getByRole('button', { name: 'Try camera preview' }));
    await view.user.click(screen.getByRole('button', { name: 'Start camera preview' }));
    view.unmount();
    await act(async () => {
      release(fake.stream);
    });
    expect(fake.stop).toHaveBeenCalledOnce();
  });
  it('explains a denied permission instead of pretending to observe', async () => {
    const view = setup(async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    });
    await view.user.click(screen.getByRole('button', { name: 'Try camera preview' }));
    await view.user.click(screen.getByRole('button', { name: 'Start camera preview' }));
    await screen.findByText(/Camera access was not granted/);
    expect(screen.queryByRole('button', { name: 'Stop camera' })).not.toBeInTheDocument();
  });
});

it('observes only the opted-in test pad and retains no typed text', async () => {
  vi.useFakeTimers();
  render(<Sensors info={info} onActivity={vi.fn()} onNotice={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Try input rhythm' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start test-pad experiment' }));
  const pad = screen.getByRole('textbox', { name: 'Rhythm test pad' });
  fireEvent.keyDown(document.body, { key: 'x' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(adapter.rhythm.mock.lastCall?.[0].keyCount).toBe(0);
  for (const key of 'secret-word') fireEvent.keyDown(pad, { key });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(adapter.rhythm.mock.lastCall?.[0].keyCount).toBe(11);
  expect(JSON.stringify(adapter.rhythm.mock.lastCall)).not.toContain('secret-word');
  expect(pad).not.toHaveTextContent('secret-word');
  fireEvent.click(screen.getByRole('button', { name: 'Stop test' }));
  expect(screen.getByRole('button', { name: 'Try input rhythm' })).toBeInTheDocument();
});

it('can exit an optional garden game without matching any pair', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(<RestGarden onClose={close} />);
  await user.click(screen.getByRole('button', { name: 'Leave the garden' }));
  expect(close).toHaveBeenCalledOnce();
});
it('matches a small garden without a score, timer, or gate', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const user = userEvent.setup();
  render(<RestGarden onClose={vi.fn()} />);
  for (let i = 1; i <= 6; i++)
    await user.click(screen.getByRole('button', { name: `Covered card ${i}` }));
  expect(screen.getByRole('status')).toHaveTextContent('There is nothing else to earn.');
  await user.click(screen.getByRole('button', { name: 'A new pattern' }));
  expect(screen.getByRole('button', { name: 'Covered card 1' })).toBeInTheDocument();
});

it('updates the chart day boundaries at midnight even without new sessions', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  const sessions: never[] = [];
  const view = render(<WeekChart sessions={sessions} />);
  const before = screen.getByRole('img').getAttribute('aria-label');
  vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
  view.rerender(<WeekChart sessions={sessions} />);
  expect(screen.getByRole('img').getAttribute('aria-label')).not.toBe(before);
});

it.each([
  ['focus', 'Pause session', 'onPause'],
  ['paused', 'Resume session', 'onResume'],
  ['break', 'Pause break', 'onPause'],
  ['breakPaused', 'Resume break', 'onResume'],
] as const)(
  'the exact native harness can find and click the real %s UI control',
  (phase, label, callback) => {
    const callbacks = {
      onStart: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onFinish: vi.fn(),
      onBreak: vi.fn(),
      onProtect: vi.fn(),
    };
    render(
      <SessionCard
        session={{ ...emptySession(), phase, id: 'a', task: 'Harness contract' }}
        settings={DEFAULT_SETTINGS}
        busy={false}
        {...callbacks}
      />,
    );
    expect(screen.getByRole('button', { name: label })).toBeVisible();
    // Execute the exact externally transported programs against the production
    // component DOM. Visible text is its accessible name, not an aria-label
    // attribute that the real button does not have.
    expect(new Function(nativeScripts.hasButton)(label, '.session-card')).toBe(true);
    new Function(nativeScripts.clickButton)(label, '.session-card');
    expect(callbacks[callback]).toHaveBeenCalledOnce();
  },
);
