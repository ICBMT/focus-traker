import type { SessionSnapshot } from './types';

export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const boundedInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
export const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

// A recovery checkpoint is data, never permission to resume a timer or sensor.
// Keep these invariants in sync with focus_core::session::SessionEngine::restore.
export function parseCheckpoint(value: unknown, now = Date.now()): SessionSnapshot | null {
  if (!isObject(value)) return null;
  const c = value;
  if (
    !boundedText(c.id, 80) ||
    !c.id ||
    !boundedText(c.task, 160) ||
    !c.task.trim() ||
    !['deep', 'reading', 'creative'].includes(String(c.mode)) ||
    !['focus', 'paused', 'breakReady', 'break', 'breakPaused'].includes(String(c.phase)) ||
    !boundedInteger(c.focusDurationMs, 60_000, 180 * 60_000) ||
    !boundedInteger(c.breakDurationMs, 20_000, 30 * 60_000) ||
    !boundedInteger(c.focusElapsedMs, 0, c.focusDurationMs) ||
    !boundedInteger(c.breakElapsedMs, 0, c.breakDurationMs) ||
    !boundedInteger(c.remainingMs, 0, 180 * 60_000) ||
    !boundedInteger(c.startedAt, Math.max(0, now - 30 * 86_400_000), now + 86_400_000) ||
    !(
      c.breakStartedAt === null ||
      boundedInteger(c.breakStartedAt, Math.max(0, now - 30 * 86_400_000), now + 86_400_000)
    ) ||
    typeof c.interrupted !== 'boolean'
  )
    return null;
  const resting = c.phase === 'break' || c.phase === 'breakPaused';
  if (resting) {
    if (c.breakStartedAt === null || c.remainingMs + c.breakElapsedMs !== c.breakDurationMs)
      return null;
  } else {
    if (
      c.breakStartedAt !== null ||
      c.breakElapsedMs !== 0 ||
      c.remainingMs + c.focusElapsedMs !== c.focusDurationMs
    )
      return null;
    if (c.phase === 'breakReady' && c.remainingMs !== 0) return null;
  }
  return {
    id: c.id,
    phase: c.phase as SessionSnapshot['phase'],
    task: c.task,
    mode: c.mode as SessionSnapshot['mode'],
    focusDurationMs: c.focusDurationMs,
    breakDurationMs: c.breakDurationMs,
    remainingMs: c.remainingMs,
    focusElapsedMs: c.focusElapsedMs,
    breakElapsedMs: c.breakElapsedMs,
    startedAt: c.startedAt,
    breakStartedAt: c.breakStartedAt as number | null,
    interrupted: c.interrupted,
  };
}
