import { describe, expect, it, vi } from 'vitest';
import {
  loadBrowserWorkspace,
  parseWorkspace,
  recordsFromSnapshot,
  saveBrowserWorkspace,
  STORAGE_KEY,
} from '../src/core/storage';
import { BrowserSession } from '../src/core/session';
import { emptyWorkspace } from '../src/core/types';

const NOW = 50 * 86_400_000;
const record = (id: string, startedAt = NOW) => ({
  id,
  kind: 'focus',
  task: 'A private task',
  mode: 'deep',
  durationMs: 60_000,
  startedAt,
  completed: true,
});
const intention = (id: string) => ({
  id,
  title: 'Write a paragraph',
  mode: 'deep',
  createdAt: NOW,
  completed: false,
});

describe('workspace validation', () => {
  it('uses safe defaults for missing or unsupported input', () => {
    expect(parseWorkspace(null)).toEqual(emptyWorkspace());
    expect(parseWorkspace({ schemaVersion: 99 })).toEqual(emptyWorkspace());
    expect(
      parseWorkspace({
        schemaVersion: 1,
        settings: { focusMinutes: Infinity, theme: 'injected', reduceMotion: true },
      }).settings,
    ).toMatchObject({ focusMinutes: 25, theme: 'light', reduceMotion: true });
  });
  it('strips unknown fields at every persistable level', () => {
    const clean = parseWorkspace(
      {
        ...emptyWorkspace(),
        cameraFrames: ['not allowed'],
        chat: ['private'],
        intentions: [{ ...intention('i'), rawKeys: 'nope' }],
        sessions: [{ ...record('s'), sensorWindow: [1, 2], checkIn: 'steady' }],
        settings: { ...emptyWorkspace().settings, apiKey: 'secret' },
      },
      NOW,
    );
    const json = JSON.stringify(clean);
    expect(json).not.toMatch(/cameraFrames|rawKeys|chat|sensorWindow|apiKey|secret/);
    expect(clean.intentions).toHaveLength(1);
    expect(clean.sessions[0].checkIn).toBe('steady');
  });
  it('deduplicates identifiers and bounds retained arrays', () => {
    const data = parseWorkspace(
      {
        ...emptyWorkspace(),
        intentions: [
          intention('same'),
          intention('same'),
          ...Array.from({ length: 110 }, (_, i) => intention(`i${i}`)),
        ],
        sessions: [
          record('same'),
          record('same'),
          ...Array.from({ length: 510 }, (_, i) => record(`s${i}`)),
        ],
      },
      NOW,
    );
    expect(data.intentions).toHaveLength(100);
    expect(data.sessions).toHaveLength(500);
    expect(new Set(data.intentions.map((i) => i.id)).size).toBe(100);
    expect(new Set(data.sessions.map((i) => i.id)).size).toBe(500);
  });
  it('retains 30 days only and rejects future, invalid, and oversized records', () => {
    const data = parseWorkspace(
      {
        ...emptyWorkspace(),
        sessions: [
          record('valid'),
          record('old', NOW - 31 * 86_400_000),
          record('future', NOW + 86_400_001),
          { ...record('bad'), durationMs: -1 },
          { ...record('rest'), kind: 'break', durationMs: 31 * 60_000 },
          { ...record('fractional'), durationMs: 0.5 },
        ],
      },
      NOW,
    );
    expect(data.sessions.map((s) => s.id)).toEqual(['valid']);
  });
  it('clears summaries when history is off and never persists a sensor baseline', () => {
    const data = parseWorkspace(
      {
        ...emptyWorkspace(),
        settings: { ...emptyWorkspace().settings, keepHistory: false },
        sessions: [record('s')],
        rhythmBaseline: [1, 0, 0, 0, 0],
      },
      NOW,
    );
    expect(data.sessions).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('rhythmBaseline');
  });
  it('keeps only a valid, explicit recovery checkpoint', () => {
    const engine = new BrowserSession(
      () => 0,
      () => NOW,
    );
    const checkpoint = engine.start({ id: 'a', task: 'My task', mode: 'deep', durationMs: 60_000 });
    const data = parseWorkspace(
      { ...emptyWorkspace(), checkpoint: { ...checkpoint, landmarks: [3] } },
      NOW,
    );
    expect(data.checkpoint).toEqual(checkpoint);
    expect(
      parseWorkspace({ ...data, checkpoint: { ...checkpoint, remainingMs: 10 } }, NOW).checkpoint,
    ).toBeNull();
  });
});

describe('browser storage failure boundaries', () => {
  it('reads a missing workspace without an error', () =>
    expect(loadBrowserWorkspace()).toEqual({ data: emptyWorkspace() }));
  it.each([
    '',
    '   ',
    '{broken',
    '{"schemaVersion":2}',
    'null',
    '[]',
    '{}',
    'false',
    '0',
    '"text"',
  ])('does not authorize writes over unreadable data: %s', (saved) => {
    localStorage.setItem(STORAGE_KEY, saved);
    const result = loadBrowserWorkspace();
    expect(result).toMatchObject({ data: emptyWorkspace(), readOnly: true });
    expect(result.warning).toContain('not been modified');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  });
  it('does not read an oversized document into the workspace', () => {
    localStorage.setItem(STORAGE_KEY, ' '.repeat(2 * 1024 * 1024 + 1));
    expect(loadBrowserWorkspace().readOnly).toBe(true);
  });
  it('handles local storage access being denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    expect(loadBrowserWorkspace()).toMatchObject({ readOnly: true, data: emptyWorkspace() });
  });
  it('surfaces write failures instead of pretending to persist', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(() => saveBrowserWorkspace(emptyWorkspace())).toThrow();
  });
});

it('extracts work and break summaries exactly when they become terminal', () => {
  let time = 0;
  const engine = new BrowserSession(
    () => time,
    () => NOW + time,
  );
  engine.start({ id: 'a', task: 'A task', mode: 'deep', durationMs: 60_000 });
  time = 5000;
  expect(recordsFromSnapshot(engine.snapshot())).toEqual([]);
  const rest = engine.startBreak('ignored', 20_000);
  expect(recordsFromSnapshot(rest)).toMatchObject([
    { id: 'a:focus', kind: 'focus', durationMs: 5000, completed: false },
  ]);
  time = 8000;
  expect(recordsFromSnapshot(engine.finish())).toMatchObject([
    { id: 'a:focus', durationMs: 5000 },
    { id: 'a:break', durationMs: 3000, completed: false },
  ]);
});
