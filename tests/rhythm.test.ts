import { describe, expect, it } from 'vitest';
import { compareRhythm, makeBaseline, RhythmAccumulator } from '../src/core/rhythm';
import type { RhythmBaseline, RhythmSummary } from '../src/core/rhythm';
import fixtures from '../fixtures/rhythm-scenarios.json';

describe('shared Rust / browser rhythm scenarios', () => {
  for (const fixture of fixtures)
    it(fixture.name, () => {
      expect(
        compareRhythm(fixture.summary as RhythmSummary, fixture.baseline as RhythmBaseline | null)
          .status,
      ).toBe(fixture.status);
    });
});

describe('bounded own-pad accumulator', () => {
  it('retains only counts and five bins, not keys or pointer locations', () => {
    const a = new RhythmAccumulator(0);
    for (let i = 0; i < 20; i++) a.key(i * 200, i === 3, false);
    a.pointer(4000, 'move');
    a.pointer(4001, 'click');
    a.pointer(4002, 'scroll');
    expect(a.snapshot(6000)).toEqual({
      keyCount: 20,
      editingCount: 1,
      pointerEvents: 1,
      clicks: 1,
      scrolls: 1,
      intervals: [0, 19, 0, 0, 0],
      observedMs: 6000,
    });
  });
  it('ignores held-key repeats', () => {
    const a = new RhythmAccumulator(0);
    a.key(10, false, false);
    a.key(20, false, true);
    expect(a.snapshot(100).keyCount).toBe(1);
  });
  it('uses coarse bucket boundaries and does not link keys across long gaps', () => {
    const a = new RhythmAccumulator(0);
    let time = 0;
    a.key(time, false, false);
    for (const interval of [124, 125, 250, 500, 1000, 5001]) {
      time += interval;
      a.key(time, false, false);
    }
    expect(a.snapshot(time).intervals).toEqual([1, 1, 1, 1, 1]);
  });
  it('resets old windows and clears prior-event state after backwards clocks', () => {
    const a = new RhythmAccumulator(100);
    a.key(200, false, false);
    a.key(400, false, false);
    expect(a.snapshot(30_101).keyCount).toBe(0);
    a.key(30_200, false, false);
    expect(a.snapshot(0).keyCount).toBe(0);
  });
  it('returns copies so a consumer cannot modify retained state', () => {
    const a = new RhythmAccumulator(0);
    a.key(0, false, false);
    a.key(200, false, false);
    a.snapshot(1000).intervals[1] = 900;
    expect(a.snapshot(1000).intervals[1]).toBe(1);
  });
  it('produces integer milliseconds for the Rust IPC schema', () => {
    const a = new RhythmAccumulator(0.1);
    expect(a.snapshot(5000.9).observedMs).toBe(5000);
  });
  it('rejects fractional/nonfinite counts and invalid baselines rather than inferring mood', () => {
    const sample = fixtures[0].summary as RhythmSummary;
    expect(makeBaseline({ ...sample, keyCount: 20.5 })).toBeNull();
    expect(compareRhythm(sample, [NaN, 1, 0, 0, 0]).status).toBe('unknown');
    expect(compareRhythm({ ...sample, observedMs: Infinity }, [0, 1, 0, 0, 0]).status).toBe(
      'unknown',
    );
  });
  it('enforces a sample-sufficiency gate', () => {
    const a = new RhythmAccumulator(0);
    for (let i = 0; i < 9; i++) a.key(i * 200, false, false);
    expect(makeBaseline(a.snapshot(4999))).toBeNull();
    expect(makeBaseline(a.snapshot(5000))).toEqual([0, 1, 0, 0, 0]);
  });
});
