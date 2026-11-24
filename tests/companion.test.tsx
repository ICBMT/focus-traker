import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompanionPolicy, defaultCompanionConfig } from '../src/core/companion';
import { CompanionPanel } from '../src/components/CompanionPanel';
import RestSpace from '../src/components/RestSpace';
import { DEFAULT_SETTINGS, emptySession } from '../src/core/types';
import { loadBrowserWorkspace, STORAGE_KEY } from '../src/core/storage';
import { emptyWorkspace } from '../src/core/types';

const focus = () => ({
  ...emptySession(),
  id: 'one',
  phase: 'focus' as const,
  focusElapsedMs: 600_000,
});
const setup = () => {
  const policy = new CompanionPolicy();
  policy.configure({
    ...defaultCompanionConfig(),
    enabled: true,
    reminders: true,
    quiet: false,
    intervalMinutes: 90,
  });
  return policy;
};
describe('voluntary reminder policy (native policy has the same regression cases)', () => {
  it('starts off, and only explicitly enabled elapsed-time reminders may appear', () => {
    const p = new CompanionPolicy();
    const s = focus();
    p.observe(s, 600_000);
    expect(p.reason).toBeNull();
    p.configure({ ...p.config, enabled: true, reminders: true, intervalMinutes: 10 });
    p.observe(s, 600_000);
    expect(p.reason).toBe('scheduled');
    p.dismiss();
    p.observe(s, 1_200_000);
    expect(p.reason).toBeNull();
    s.focusElapsedMs += 600_000;
    p.observe(s, 1_200_000);
    expect(p.reason).toBe('scheduled');
    expect(s.phase).toBe('focus');
  });
  it('requires two spaced screen suggestions, elapsed work, and unprotected focus', () => {
    const p = setup();
    const s = focus();
    p.screenAdvice(true, s, 600_000);
    p.screenAdvice(true, s, 630_000);
    expect(p.reason).toBeNull();
    p.screenAdvice(true, s, 690_000);
    expect(p.reason).toBe('screenContext');
    expect(s.phase).toBe('focus');
    p.dismiss();
    p.configure({ ...p.config, quiet: true });
    p.screenAdvice(true, s, 1_300_000);
    p.screenAdvice(true, s, 1_390_000);
    expect(p.reason).toBeNull();
  });
  it('resets uncertain/old votes instead of escalating them into a detection', () => {
    const p = setup();
    const s = focus();
    p.screenAdvice(true, s, 0);
    p.screenAdvice(false, s, 90_000);
    p.screenAdvice(true, s, 180_000);
    expect(p.reason).toBeNull();
    p.screenAdvice(true, s, 600_000);
    expect(p.reason).toBeNull();
    p.screenAdvice(true, { ...s, focusElapsedMs: 10 }, 690_000);
    expect(p.reason).toBeNull();
  });
  it('honors snooze, cooldown, and three invitations/hour across session changes', () => {
    const p = setup();
    const s = { ...focus(), phase: 'breakReady' as const };
    p.observe(s, 0);
    p.snooze(0);
    p.observe(s, 599_999);
    expect(p.reason).toBeNull();
    p.observe(s, 600_000);
    expect(p.reason).toBe('sessionComplete');
    p.dismiss();
    s.id = 'two';
    p.observe(s, 1_200_000);
    expect(p.reason).toBe('sessionComplete');
    p.dismiss();
    s.id = 'three';
    p.observe(s, 1_800_000);
    expect(p.reason).toBeNull();
    p.observe(s, 3_600_001);
    expect(p.reason).toBe('sessionComplete');
  });
  it('pausing, new sessions, disabling, and presentation mode clear stale invitations', () => {
    const p = setup();
    const s = { ...focus(), phase: 'breakReady' as const };
    p.observe(s, 0);
    p.configure({ ...p.config, presentation: true });
    expect(p.reason).toBeNull();
    p.observe(s, 1_000_000);
    expect(p.reason).toBeNull();
    p.configure({ ...p.config, presentation: false });
    p.observe({ ...s, phase: 'paused' }, 2_000_000);
    expect(p.reason).toBeNull();
    p.observe({ ...s, id: 'new', phase: 'focus', focusElapsedMs: 0 }, 2_100_000);
    expect(p.reason).toBeNull();
    expect(() => p.configure({ ...p.config, intervalMinutes: 1 })).toThrow();
  });
});

it('additively migrates old v1 preferences but preserves invalid or sensitive fields', () => {
  const data = emptyWorkspace();
  const old = { ...data.settings } as Partial<typeof data.settings>;
  delete old.overlayEnabled;
  delete old.gentleReminders;
  delete old.reminderMinutes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, settings: old }));
  const loaded = loadBrowserWorkspace();
  expect(loaded.readOnly).not.toBe(true);
  expect(loaded.data.settings).toEqual(DEFAULT_SETTINGS);
  for (const patch of [
    { reminderMinutes: 0 },
    { overlayEnabled: 'yes' },
    { screenSharing: true },
    { screenshot: 'never store this' },
  ]) {
    const raw = JSON.stringify({ ...data, settings: { ...data.settings, ...patch } });
    localStorage.setItem(STORAGE_KEY, raw);
    expect(loadBrowserWorkspace().readOnly).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  }
});

it('reveals the timer on keyboard focus and never grabs focus for an invitation', () => {
  const action = vi.fn();
  const config = { ...defaultCompanionConfig(), enabled: true };
  const status = {
    config,
    phase: 'focus' as const,
    remainingMs: 30_000,
    reason: null,
    screenSharing: false,
    gnomeConnected: false,
    placement: 'browser' as const,
  };
  const view = render(<CompanionPanel status={status} onAction={action} />);
  const tab = screen.getByRole('button', { name: 'Show timer, 00:30' });
  act(() => tab.focus());
  expect(screen.getByRole('button', { name: 'A little rest' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Snooze 10m' }));
  expect(action).toHaveBeenCalledWith('snooze');
  const opener = document.createElement('button');
  document.body.append(opener);
  act(() => opener.focus());
  view.rerender(
    <CompanionPanel
      status={{ ...status, reason: 'scheduled', screenSharing: true }}
      onAction={action}
    />,
  );
  expect(opener).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /Screen context ON/ }));
  expect(action).toHaveBeenCalledWith('stopSharing');
  fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
  expect(action).toHaveBeenCalledWith('dismiss');
  view.rerender(
    <CompanionPanel
      status={{ ...status, config: { ...config, presentation: true } }}
      onAction={action}
    />,
  );
  view.rerender(<CompanionPanel status={status} onAction={action} />);
  expect(screen.getByRole('button', { name: 'Show timer, 00:30' })).toBeVisible();
  opener.remove();
});

it('the rest space has an immediate exit with no required game, reply, or timer', () => {
  const close = vi.fn();
  const begin = vi.fn();
  const garden = vi.fn();
  render(
    <RestSpace
      session={{ ...focus(), phase: 'paused', task: 'One private intention' }}
      message={null}
      minutes={5}
      busy={false}
      onClose={close}
      onBreak={begin}
      onResume={vi.fn()}
      onGarden={garden}
      onTalk={vi.fn()}
    />,
  );
  expect(screen.getByText(/One private intention/)).toBeVisible();
  expect(begin).not.toHaveBeenCalled();
  expect(garden).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Leave this space' }));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByText(/Leaving won’t restart it/)).toBeVisible();
});

it('renders model output as text, with uncertainty and no hidden action', () => {
  const unsafe = '<img src=x onerror=alert(1)>';
  render(
    <RestSpace
      session={focus()}
      message={{ message: unsafe, observation: 'A document, perhaps', suggestBreak: true }}
      minutes={5}
      busy={false}
      onClose={vi.fn()}
      onBreak={vi.fn()}
      onResume={vi.fn()}
      onGarden={vi.fn()}
      onTalk={vi.fn()}
    />,
  );
  expect(screen.getByText(unsafe)).toBeVisible();
  expect(document.querySelector('.rest-message img')).toBeNull();
  expect(screen.getByText('AI suggestion · may be mistaken')).toBeVisible();
});
