export type WorkStyle = 'deep' | 'reading' | 'creative';
export type Phase =
  'idle' | 'focus' | 'paused' | 'breakReady' | 'break' | 'breakPaused' | 'complete';
export type Page = 'overview' | 'room' | 'insights' | 'sensors' | 'notifications' | 'settings';
export type CheckIn = 'inTheZone' | 'steady' | 'stuck' | 'tired';

export interface SessionSnapshot {
  id: string | null;
  phase: Phase;
  task: string;
  mode: WorkStyle;
  focusDurationMs: number;
  breakDurationMs: number;
  remainingMs: number;
  focusElapsedMs: number;
  breakElapsedMs: number;
  startedAt: number | null;
  breakStartedAt: number | null;
  interrupted: boolean;
}

export interface StartOptions {
  id: string;
  task: string;
  mode: WorkStyle;
  durationMs: number;
}

export interface Intention {
  id: string;
  title: string;
  mode: WorkStyle;
  completed: boolean;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  kind: 'focus' | 'break';
  task: string;
  mode: WorkStyle;
  startedAt: number;
  durationMs: number;
  completed: boolean;
  checkIn?: CheckIn;
}

export interface Settings {
  focusMinutes: number;
  breakMinutes: number;
  dailyGoalMinutes: number;
  protectFocus: boolean;
  keepHistory: boolean;
  theme: 'light' | 'dark' | 'system';
  reduceMotion: boolean;
  overlayEnabled: boolean;
  gentleReminders: boolean;
  reminderMinutes: number;
  setupCompleted: boolean;
}

export interface Workspace {
  schemaVersion: 1;
  intentions: Intention[];
  sessions: SessionRecord[];
  settings: Settings;
  checkpoint: SessionSnapshot | null;
}

export interface RuntimeInfo {
  kind: 'web' | 'desktop';
  platform: string;
  sessionType: string;
  engine: 'browser' | 'rust';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  size: number;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  breakMinutes: 5,
  dailyGoalMinutes: 120,
  protectFocus: true,
  keepHistory: true,
  theme: 'light',
  reduceMotion: false,
  overlayEnabled: false,
  gentleReminders: false,
  reminderMinutes: 25,
  setupCompleted: false,
};

export const WORK_STYLES: Record<WorkStyle, { label: string; description: string }> = {
  deep: { label: 'Deep work', description: 'One thing. Your full attention.' },
  reading: { label: 'Reading & learning', description: 'Space to read, think, and understand.' },
  creative: { label: 'Creative work', description: 'Follow an idea a little further.' },
};

export const emptySession = (): SessionSnapshot => ({
  id: null,
  phase: 'idle',
  task: '',
  mode: 'deep',
  focusDurationMs: 25 * 60_000,
  breakDurationMs: 5 * 60_000,
  remainingMs: 25 * 60_000,
  focusElapsedMs: 0,
  breakElapsedMs: 0,
  startedAt: null,
  breakStartedAt: null,
  interrupted: false,
});

export const emptyWorkspace = (): Workspace => ({
  schemaVersion: 1,
  intentions: [],
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
  checkpoint: null,
});

export function isActive(phase: Phase): boolean {
  return ['focus', 'paused', 'breakReady', 'break', 'breakPaused'].includes(phase);
}

export function formatTimer(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const minutes = Math.floor(ms / 60_000);
  if (minutes === 0) return '<1m';
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
    : `${minutes}m`;
}

export function dayKey(date: Date | number): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
