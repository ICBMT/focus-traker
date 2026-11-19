export interface RhythmSummary {
  keyCount: number;
  pointerEvents: number;
  editingCount: number;
  clicks: number;
  scrolls: number;
  intervals: [number, number, number, number, number];
  observedMs: number;
}
export type RhythmStatus = 'unknown' | 'steady' | 'changed';
export type RhythmBaseline = [number, number, number, number, number];
export interface RhythmResult {
  status: RhythmStatus;
  reason: string;
}

// Own-test-pad adapter only. No keys, text, event arrays, or trajectories are retained.
export class RhythmAccumulator {
  private start: number;
  private previousKey: number | null = null;
  private data: Omit<RhythmSummary, 'observedMs'> = this.empty();
  constructor(now: number) {
    this.start = now;
  }
  private empty(): Omit<RhythmSummary, 'observedMs'> {
    return {
      keyCount: 0,
      pointerEvents: 0,
      editingCount: 0,
      clicks: 0,
      scrolls: 0,
      intervals: [0, 0, 0, 0, 0],
    };
  }
  reset(now: number) {
    this.start = now;
    this.previousKey = null;
    this.data = this.empty();
  }
  private advance(now: number) {
    if (!Number.isFinite(now)) return false;
    if (now < this.start || now - this.start > 30_000) this.reset(now);
    return true;
  }
  key(now: number, editing: boolean, repeat: boolean) {
    if (!this.advance(now) || repeat) return;
    this.data.keyCount = Math.min(1_000_000, this.data.keyCount + 1);
    if (editing) this.data.editingCount = Math.min(this.data.keyCount, this.data.editingCount + 1);
    if (this.previousKey !== null) {
      const interval = now - this.previousKey;
      if (interval >= 0 && interval <= 5000) {
        const bucket =
          interval < 125 ? 0 : interval < 250 ? 1 : interval < 500 ? 2 : interval < 1000 ? 3 : 4;
        this.data.intervals[bucket] = Math.min(1_000_000, this.data.intervals[bucket] + 1);
      }
    }
    this.previousKey = now;
  }
  pointer(now: number, kind: 'move' | 'click' | 'scroll') {
    if (!this.advance(now)) return;
    if (kind === 'move') this.data.pointerEvents = Math.min(1_000_000, this.data.pointerEvents + 1);
    if (kind === 'click') this.data.clicks = Math.min(1_000_000, this.data.clicks + 1);
    if (kind === 'scroll') this.data.scrolls = Math.min(1_000_000, this.data.scrolls + 1);
  }
  snapshot(now: number): RhythmSummary {
    this.advance(now);
    return {
      ...this.data,
      intervals: [...this.data.intervals],
      observedMs: Number.isFinite(now)
        ? Math.floor(Math.min(30_000, Math.max(0, now - this.start)))
        : 0,
    };
  }
}

export function makeBaseline(summary: RhythmSummary): RhythmBaseline | null {
  if (
    !validSummary(summary) ||
    summary.observedMs < 5000 ||
    summary.intervals.reduce((a, b) => a + b, 0) < 8
  )
    return null;
  const total = summary.intervals.reduce((a, b) => a + b, 0);
  return summary.intervals.map((n) => n / total) as RhythmBaseline;
}

function validSummary(s: RhythmSummary): boolean {
  return (
    [
      s.keyCount,
      s.pointerEvents,
      s.editingCount,
      s.clicks,
      s.scrolls,
      ...s.intervals,
      s.observedMs,
    ].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000) &&
    s.observedMs <= 30_000 &&
    s.intervals.length === 5 &&
    s.intervals.every(Number.isInteger) &&
    s.intervals.reduce((a, b) => a + b, 0) <= s.keyCount
  );
}

export function compareRhythm(
  summary: RhythmSummary,
  baseline: RhythmBaseline | null,
): RhythmResult {
  const current = makeBaseline(summary);
  if (!current)
    return {
      status: 'unknown',
      reason: 'More valid typing is needed. Missing or sparse input is not disengagement.',
    };
  if (!baseline)
    return {
      status: 'unknown',
      reason: 'No baseline yet. Save a comparison sample when you are comfortable.',
    };
  if (
    baseline.length !== 5 ||
    baseline.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
    Math.abs(baseline.reduce((a, b) => a + b, 0) - 1) > 0.01
  )
    return { status: 'unknown', reason: 'The baseline is invalid. Reset it before comparing.' };
  const distance = current.reduce((sum, value, i) => sum + Math.abs(value - baseline[i]), 0) / 2;
  return distance > 0.35
    ? {
        status: 'changed',
        reason:
          'Cadence differs from your sample. The cause is unknown; this is not a boredom or mood verdict.',
      }
    : {
        status: 'steady',
        reason: 'Cadence resembles your sample. This does not establish psychological flow.',
      };
}
