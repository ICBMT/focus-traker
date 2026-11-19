import { describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/core/session';
import { parseCheckpoint } from '../src/core/checkpoint';
import { formatDuration, formatTimer } from '../src/core/types';
import type { SessionSnapshot, StartOptions } from '../src/core/types';
import scenarios from '../fixtures/session-scenarios.json';

interface Step {
  op: string;
  mono: number;
  wall: number;
  options?: StartOptions;
  id?: string;
  durationMs?: number;
}
const NOW = 1_000_000;
function harness() {
  let mono = 0,
    wall = NOW;
  const engine = new BrowserSession(
    () => mono,
    () => wall,
  );
  const clock = (m: number, w = NOW + m) => {
    mono = m;
    wall = w;
  };
  const start = (patch: Partial<StartOptions> = {}) =>
    engine.start({
      id: 'session',
      task: 'Write a paragraph',
      mode: 'deep',
      durationMs: 60_000,
      ...patch,
    });
  return { engine, clock, start };
}

describe('shared Rust / browser session scenarios', () => {
  for (const scenario of scenarios)
    it(scenario.name, () => {
      const { engine, clock } = harness();
      for (const step of scenario.steps as Step[]) {
        clock(step.mono, step.wall);
        switch (step.op) {
          case 'start':
            engine.start(step.options as StartOptions);
            break;
          case 'tick':
            engine.snapshot();
            break;
          case 'pause':
            engine.pause();
            break;
          case 'resume':
            engine.resume();
            break;
          case 'finish':
            engine.finish();
            break;
          case 'break':
            engine.startBreak(step.id!, step.durationMs!);
            break;
          case 'restore': {
            const snapshot = engine.snapshot();
            engine.reset();
            engine.restore(snapshot);
            break;
          }
          case 'reset':
            engine.reset();
            break;
        }
      }
      expect(engine.snapshot()).toMatchObject(scenario.expected);
    });
});

describe('session boundaries', () => {
  it.each([0, -1, 59_999, 10_800_001, NaN, Infinity, 60_000.5])(
    'rejects invalid focus duration %s without mutation',
    (durationMs) => {
      const { engine, start } = harness();
      const before = engine.snapshot();
      expect(() => start({ durationMs })).toThrow();
      expect(engine.snapshot()).toEqual(before);
    },
  );
  it('bounds task names in UTF-16 units, not bytes', () => {
    const { start } = harness();
    expect(start({ task: '🌿'.repeat(80) }).task.length).toBe(160);
    expect(() => start({ task: '🌿'.repeat(81) })).toThrow();
  });
  it('does not replace an active session', () => {
    const { engine, start, clock } = harness();
    start();
    clock(3000);
    const before = engine.snapshot();
    expect(() => start({ task: 'Something else' })).toThrow();
    expect(engine.snapshot()).toEqual(before);
  });
  it('supports an optional, immediately escapable break', () => {
    const { engine, clock } = harness();
    engine.startBreak('rest', 20_000);
    clock(2000);
    engine.finish();
    expect(engine.snapshot()).toMatchObject({
      phase: 'complete',
      focusElapsedMs: 0,
      breakElapsedMs: 2000,
    });
  });
  it.each([19_999, 1_800_001, NaN, Infinity, 20_000.5])(
    'rejects invalid break duration %s',
    (duration) => {
      const { engine } = harness();
      expect(() => engine.startBreak('rest', duration)).toThrow();
      expect(engine.snapshot().phase).toBe('idle');
    },
  );
  it('does not restart a running break', () => {
    const { engine } = harness();
    engine.startBreak('rest', 20_000);
    expect(() => engine.startBreak('other', 20_000)).toThrow();
    expect(engine.snapshot().id).toBe('rest');
  });
  it('rounds monotonic clock readings to serializable integer milliseconds', () => {
    let time = 0.125;
    const engine = new BrowserSession(
      () => time,
      () => NOW,
    );
    engine.start({ id: 'a', task: 'A task', mode: 'deep', durationMs: 60_000 });
    time = 1000.875;
    expect(engine.snapshot().focusElapsedMs).toBe(1000);
  });
  it('validates recovery relationships, finite values, age, and timestamp presence', () => {
    const { engine, start } = harness();
    const valid = start();
    engine.reset();
    const invalid: Partial<SessionSnapshot>[] = [
      { remainingMs: NaN },
      { remainingMs: 60_001 },
      { focusElapsedMs: 1 },
      { startedAt: null },
      { breakStartedAt: NOW },
      { focusDurationMs: 0 },
      { task: '' },
      { id: '' },
      { phase: 'break', breakStartedAt: null },
      { startedAt: NOW + 86_400_001 },
    ];
    for (const patch of invalid) {
      expect(parseCheckpoint({ ...valid, ...patch }, NOW)).toBeNull();
      expect(() => engine.restore({ ...valid, ...patch })).toThrow();
    }
    expect(engine.restore(valid)).toMatchObject({ phase: 'paused', interrupted: true });
  });
  it('keeps elapsed and remaining bounds under a repeatable sequence of pauses and gaps', () => {
    const { engine, start, clock } = harness();
    start({ durationMs: 10_800_000 });
    let time = 0;
    for (let i = 1; i <= 500; i++) {
      time += i % 17 === 0 ? 20_000 : 137;
      clock(time);
      if (i % 7 === 0) engine.pause();
      if (i % 9 === 0) engine.resume();
      const state = engine.snapshot();
      expect(state.remainingMs + state.focusElapsedMs).toBe(state.focusDurationMs);
      expect(state.focusElapsedMs).toBeGreaterThanOrEqual(0);
      expect(state.focusElapsedMs).toBeLessThanOrEqual(state.focusDurationMs);
    }
  });
});

it('formats timer and session time without negative or fabricated minutes', () => {
  expect(formatTimer(-100)).toBe('00:00');
  expect(formatTimer(60_001)).toBe('01:01');
  expect(formatDuration(999)).toBe('<1m');
  expect(formatDuration(7_500_000)).toBe('2h 5m');
});
