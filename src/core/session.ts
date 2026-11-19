import { parseCheckpoint } from './checkpoint';
import { emptySession } from './types';
import type { SessionSnapshot, StartOptions } from './types';

// Browser-only preview adapter. Desktop sessions are authorized and timed in Rust.
// These transitions are mirrored by crates/focus-core and covered by shared scenarios.
export class BrowserSession {
  private state: SessionSnapshot = emptySession();
  private lastMono: number | null = null;
  private lastWall: number | null = null;

  constructor(
    private readonly mono: () => number = () => performance.now(),
    private readonly wall: () => number = Date.now,
  ) {}

  reset(): SessionSnapshot {
    this.state = emptySession();
    this.resetClock();
    return { ...this.state };
  }

  snapshot(): SessionSnapshot {
    this.tick();
    return { ...this.state };
  }

  private resetClock() {
    this.lastMono = Math.floor(this.mono());
    this.lastWall = this.wall();
  }

  tick() {
    const now = Math.floor(this.mono());
    const wall = this.wall();
    const previousMono = this.lastMono;
    const elapsed = previousMono === null ? 0 : Math.max(0, now - previousMono);
    const wallGap = this.lastWall === null ? 0 : wall - this.lastWall;
    this.lastMono = now;
    this.lastWall = wall;
    if (!['focus', 'break'].includes(this.state.phase)) return;
    if (
      (previousMono !== null && now < previousMono) ||
      elapsed > 15_000 ||
      wallGap > 15_000 ||
      wallGap < -15_000
    ) {
      this.state.phase = this.state.phase === 'focus' ? 'paused' : 'breakPaused';
      this.state.interrupted = true;
      return;
    }
    const consumed = Math.min(elapsed, this.state.remainingMs);
    this.state.remainingMs = Math.max(0, this.state.remainingMs - consumed);
    if (this.state.phase === 'focus') this.state.focusElapsedMs += consumed;
    else this.state.breakElapsedMs += consumed;
    if (this.state.remainingMs === 0)
      this.state.phase = this.state.phase === 'focus' ? 'breakReady' : 'complete';
  }

  start(options: StartOptions): SessionSnapshot {
    if (!['idle', 'complete'].includes(this.state.phase))
      throw new Error('Finish the current session before starting another.');
    if (
      !options.task.trim() ||
      options.task.trim().length > 160 ||
      !options.id ||
      options.id.length > 80
    )
      throw new Error('Choose an intention between 1 and 160 characters.');
    if (!['deep', 'reading', 'creative'].includes(options.mode))
      throw new Error('Choose a supported work style.');
    if (
      !Number.isSafeInteger(options.durationMs) ||
      options.durationMs < 60_000 ||
      options.durationMs > 180 * 60_000
    )
      throw new Error('Choose a duration between 1 and 180 minutes.');
    this.state = {
      ...emptySession(),
      id: options.id,
      phase: 'focus',
      task: options.task.trim(),
      mode: options.mode,
      focusDurationMs: options.durationMs,
      remainingMs: options.durationMs,
      startedAt: this.wall(),
    };
    this.resetClock();
    return { ...this.state };
  }

  pause(): SessionSnapshot {
    this.tick();
    if (this.state.phase === 'focus') this.state.phase = 'paused';
    if (this.state.phase === 'break') this.state.phase = 'breakPaused';
    return { ...this.state };
  }

  resume(): SessionSnapshot {
    if (this.state.phase === 'paused') this.state.phase = 'focus';
    if (this.state.phase === 'breakPaused') this.state.phase = 'break';
    this.state.interrupted = false;
    this.resetClock();
    return { ...this.state };
  }

  finish(): SessionSnapshot {
    this.tick();
    if (this.state.phase !== 'idle') this.state.phase = 'complete';
    this.state.interrupted = false;
    return { ...this.state };
  }

  startBreak(id: string, durationMs: number): SessionSnapshot {
    if (
      !Number.isSafeInteger(durationMs) ||
      durationMs < 20_000 ||
      durationMs > 30 * 60_000 ||
      !id ||
      id.length > 80
    )
      throw new Error('Choose a break between 20 seconds and 30 minutes.');
    this.tick();
    if (['break', 'breakPaused'].includes(this.state.phase))
      throw new Error('A break is already in progress.');
    if (['idle', 'complete'].includes(this.state.phase))
      this.state = { ...emptySession(), id, task: 'A moment to reset', startedAt: this.wall() };
    this.state.phase = 'break';
    this.state.breakDurationMs = durationMs;
    this.state.remainingMs = durationMs;
    this.state.breakElapsedMs = 0;
    this.state.breakStartedAt = this.wall();
    this.state.interrupted = false;
    this.resetClock();
    return { ...this.state };
  }

  restore(snapshot: SessionSnapshot): SessionSnapshot {
    if (!['idle', 'complete'].includes(this.state.phase))
      throw new Error('A session is already active.');
    const valid = parseCheckpoint(snapshot, this.wall());
    if (!valid) throw new Error('The saved session could not be recovered safely.');
    this.state = {
      ...valid,
      phase:
        snapshot.phase === 'breakReady'
          ? 'breakReady'
          : ['break', 'breakPaused'].includes(snapshot.phase)
            ? 'breakPaused'
            : 'paused',
      interrupted: true,
    };
    this.resetClock();
    return { ...this.state };
  }
}
