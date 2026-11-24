import { boundedInteger, boundedText, isObject, parseCheckpoint } from './checkpoint';
import { DEFAULT_SETTINGS, emptyWorkspace, isActive } from './types';
import type { SessionRecord, SessionSnapshot, Workspace } from './types';

export const STORAGE_KEY = 'focus.workspace.v1';
const styles = ['deep', 'reading', 'creative'];
const object = isObject;
const finite = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const text = boundedText;

export function parseWorkspace(raw: unknown, now = Date.now()): Workspace {
  const fallback = emptyWorkspace();
  if (!object(raw) || raw.schemaVersion !== 1) return fallback;
  const settings = object(raw.settings) ? raw.settings : {};
  fallback.settings = {
    focusMinutes: finite(settings.focusMinutes, 1, 180)
      ? Math.round(settings.focusMinutes)
      : DEFAULT_SETTINGS.focusMinutes,
    breakMinutes: finite(settings.breakMinutes, 1, 30)
      ? Math.round(settings.breakMinutes)
      : DEFAULT_SETTINGS.breakMinutes,
    dailyGoalMinutes: finite(settings.dailyGoalMinutes, 15, 480)
      ? Math.round(settings.dailyGoalMinutes)
      : DEFAULT_SETTINGS.dailyGoalMinutes,
    protectFocus: typeof settings.protectFocus === 'boolean' ? settings.protectFocus : true,
    keepHistory: typeof settings.keepHistory === 'boolean' ? settings.keepHistory : true,
    theme: ['light', 'dark', 'system'].includes(String(settings.theme))
      ? (settings.theme as 'light' | 'dark' | 'system')
      : 'light',
    reduceMotion: settings.reduceMotion === true,
    overlayEnabled: settings.overlayEnabled === true,
    gentleReminders: settings.gentleReminders === true,
    reminderMinutes: finite(settings.reminderMinutes, 10, 90)
      ? Math.round(settings.reminderMinutes)
      : 25,
    setupCompleted: settings.setupCompleted === true,
  };
  const intentionsSeen = new Set<string>();
  if (Array.isArray(raw.intentions))
    fallback.intentions = raw.intentions
      .filter(
        (v) =>
          object(v) &&
          text(v.id, 80) &&
          v.id.length > 0 &&
          text(v.title, 160) &&
          v.title.trim().length > 0 &&
          styles.includes(String(v.mode)) &&
          typeof v.completed === 'boolean' &&
          boundedInteger(v.createdAt, 0, now + 86_400_000) &&
          !intentionsSeen.has(v.id) &&
          !!intentionsSeen.add(v.id),
      )
      .slice(0, 100)
      .map((v) => {
        const i = v as unknown as Workspace['intentions'][number];
        return {
          id: i.id,
          title: i.title,
          mode: i.mode,
          completed: i.completed,
          createdAt: i.createdAt,
        };
      });
  if (fallback.settings.keepHistory && Array.isArray(raw.sessions)) {
    const seen = new Set<string>();
    fallback.sessions = raw.sessions
      .filter((v) => {
        if (
          !object(v) ||
          !text(v.id, 100) ||
          !v.id ||
          seen.has(v.id) ||
          !['focus', 'break'].includes(String(v.kind)) ||
          !text(v.task, 160) ||
          !styles.includes(String(v.mode)) ||
          !boundedInteger(v.startedAt, Math.max(0, now - 30 * 86_400_000), now + 86_400_000) ||
          !boundedInteger(v.durationMs, 1, (v.kind === 'break' ? 30 : 180) * 60_000) ||
          typeof v.completed !== 'boolean'
        )
          return false;
        seen.add(v.id);
        return true;
      })
      .slice(-500)
      .map((value) => {
        const v = value as SessionRecord;
        return {
          id: v.id,
          kind: v.kind,
          task: v.task,
          mode: v.mode,
          startedAt: v.startedAt,
          durationMs: v.durationMs,
          completed: v.completed,
          ...(['inTheZone', 'steady', 'stuck', 'tired'].includes(v.checkIn ?? '')
            ? { checkIn: v.checkIn }
            : {}),
        };
      });
  }
  fallback.checkpoint = parseCheckpoint(raw.checkpoint, now);
  return fallback;
}

function equivalentJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => equivalentJson(value, b[i]))
    );
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equivalentJson(a[key], b[key]))
  );
}
export function loadBrowserWorkspace(now = Date.now()): {
  data: Workspace;
  warning?: string;
  readOnly?: boolean;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { data: emptyWorkspace() };
    if (raw.length > 2 * 1024 * 1024)
      return {
        data: emptyWorkspace(),
        warning: 'Saved data is larger than expected and has not been modified.',
        readOnly: true,
      };
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed) || parsed.schemaVersion !== 1)
      return {
        data: emptyWorkspace(),
        warning:
          'This saved workspace has an invalid or unsupported format. It has not been modified; this session is temporary.',
        readOnly: true,
      };
    const data = parseWorkspace(parsed, now);
    // Parsing is intentionally tolerant for explicit sanitization/export. Loading
    // must be stricter: never autosave repaired defaults over a corrupt v1 file.
    // Retention and the explicit history opt-out are the only silent removals.
    const expected = { ...parsed };
    // Additive v1 migration only: absent new preferences receive safe defaults.
    // Present-but-invalid and unknown fields still preserve the corrupt original.
    if (object(parsed.settings))
      expected.settings = {
        overlayEnabled: false,
        gentleReminders: false,
        reminderMinutes: 25,
        setupCompleted: false,
        ...parsed.settings,
      };
    if (Array.isArray(parsed.sessions) && object(parsed.settings))
      expected.sessions =
        parsed.settings.keepHistory === false
          ? []
          : parsed.sessions.filter(
              (record) =>
                !(object(record) && boundedInteger(record.startedAt, 0, now - 30 * 86_400_000 - 1)),
            );
    if (
      object(parsed.checkpoint) &&
      boundedInteger(parsed.checkpoint.startedAt, 0, now - 30 * 86_400_000 - 1)
    )
      expected.checkpoint = null;
    if (!equivalentJson(data, expected))
      return {
        data,
        readOnly: true,
        warning:
          'Saved workspace fields failed validation. The original has not been modified; this session is temporary. Export a recovered copy or explicitly reset it.',
      };
    return { data };
  } catch {
    return {
      data: emptyWorkspace(),
      warning: 'Saved data could not be read. It has not been modified; this session is temporary.',
      readOnly: true,
    };
  }
}

export function saveBrowserWorkspace(data: Workspace): void {
  const clean = parseWorkspace(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export function recordsFromSnapshot(snapshot: Workspace['checkpoint']): SessionRecord[] {
  if (!snapshot?.id || snapshot.startedAt === null) return [];
  const records: SessionRecord[] = [];
  if (
    snapshot.focusElapsedMs > 0 &&
    ['breakReady', 'break', 'breakPaused', 'complete'].includes(snapshot.phase)
  )
    records.push({
      id: `${snapshot.id}:focus`,
      kind: 'focus',
      task: snapshot.task,
      mode: snapshot.mode,
      startedAt: snapshot.startedAt,
      durationMs: snapshot.focusElapsedMs,
      completed: snapshot.focusElapsedMs >= snapshot.focusDurationMs,
    });
  if (
    snapshot.breakElapsedMs > 0 &&
    snapshot.phase === 'complete' &&
    snapshot.breakStartedAt !== null
  )
    records.push({
      id: `${snapshot.id}:break`,
      kind: 'break',
      task: 'A moment to reset',
      mode: snapshot.mode,
      startedAt: snapshot.breakStartedAt,
      durationMs: snapshot.breakElapsedMs,
      completed: snapshot.breakElapsedMs >= snapshot.breakDurationMs,
    });
  return records;
}

// records is explicit so a history-off -> on toggle cannot reinsert a terminal
// snapshot already consumed while retention was disabled.
export function workspaceAfterSnapshot(
  data: Workspace,
  snapshot: SessionSnapshot,
  records: SessionRecord[],
  now = Date.now(),
): Workspace {
  return {
    ...data,
    checkpoint: isActive(snapshot.phase) ? { ...snapshot } : null,
    sessions: data.settings.keepHistory
      ? [
          ...data.sessions,
          ...records.filter((record) => !data.sessions.some((saved) => saved.id === record.id)),
        ]
          .filter((record) => record.startedAt >= now - 30 * 86_400_000)
          .slice(-500)
      : [],
  };
}
