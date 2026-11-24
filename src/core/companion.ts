import type { SessionSnapshot } from './types';

export type ReminderReason = 'scheduled' | 'sessionComplete' | 'screenContext';
export type CompanionAction =
  'open' | 'rest' | 'talk' | 'pause' | 'resume' | 'snooze' | 'dismiss' | 'stopSharing' | 'disable';
export interface CompanionConfig {
  enabled: boolean;
  reminders: boolean;
  intervalMinutes: number;
  presentation: boolean;
  quiet: boolean;
  theme: 'light' | 'dark';
  reduceMotion: boolean;
}
export interface CompanionStatus {
  config: CompanionConfig;
  phase: SessionSnapshot['phase'];
  remainingMs: number;
  reason: ReminderReason | null;
  screenSharing: boolean;
  gnomeConnected: boolean;
  placement: 'browser' | 'compositor' | 'requested';
  message?: string;
}
export interface ScreenAdvice {
  message: string;
  observation: string;
  suggestBreak: boolean;
}
export const defaultCompanionConfig = (): CompanionConfig => ({
  enabled: false,
  reminders: false,
  intervalMinutes: 25,
  presentation: false,
  quiet: true,
  theme: 'light',
  reduceMotion: false,
});
export const reminderCopy: Record<ReminderReason, { title: string; detail: string }> = {
  scheduled: {
    title: 'A little room to reset?',
    detail: 'Your chosen work interval has passed. Take a pause, or keep going.',
  },
  sessionComplete: {
    title: 'A small finish. A fresh breath.',
    detail: 'Your focus timer has finished. A break is an invitation, not a requirement.',
  },
  screenContext: {
    title: 'Would a change of pace help?',
    detail: 'Your optional screen-context model suggested a pause. It may be wrong; you decide.',
  },
};

// Browser fallback for the same conservative native policy. No activity/face
// label is accepted. Only elapsed focus time and an explicitly enabled model's
// advisory can suggest a nudge. All times passed here are monotonic milliseconds.
export class CompanionPolicy {
  config = defaultCompanionConfig();
  reason: ReminderReason | null = null;
  private session: string | null = null;
  private acknowledgedFocus = 0;
  private completed = false;
  private notices: number[] = [];
  private lastNotice = -Infinity;
  private snoozeUntil = 0;
  private snoozed: ReminderReason | null = null;
  private votes = 0;
  private lastVote = -Infinity;
  configure(config: CompanionConfig) {
    if (
      !Number.isInteger(config.intervalMinutes) ||
      config.intervalMinutes < 10 ||
      config.intervalMinutes > 90
    )
      throw new Error('Choose a reminder interval from 10 to 90 whole minutes.');
    this.config = { ...config };
    if (!config.enabled || !config.reminders || config.presentation) {
      this.reason = null;
      this.snoozed = null;
      this.votes = 0;
    }
  }
  private issue(reason: ReminderReason, snapshot: SessionSnapshot, now: number) {
    this.notices = this.notices.filter((t) => now - t < 3_600_000 && now >= t);
    if (
      !this.config.enabled ||
      !this.config.reminders ||
      this.config.presentation ||
      this.reason ||
      now < this.snoozeUntil ||
      now - this.lastNotice < 600_000 ||
      this.notices.length >= 3
    )
      return;
    this.reason = reason;
    this.lastNotice = now;
    this.notices.push(now);
    this.acknowledgedFocus = snapshot.focusElapsedMs;
    this.completed ||= reason === 'sessionComplete';
    this.snoozed = null;
  }
  observe(snapshot: SessionSnapshot, now: number) {
    if (snapshot.id !== this.session) {
      this.session = snapshot.id;
      this.acknowledgedFocus = 0;
      this.completed = false;
      this.reason = null;
      this.snoozed = null;
      this.votes = 0;
    }
    if (!['focus', 'breakReady'].includes(snapshot.phase)) {
      this.reason = null;
      this.votes = 0;
      return;
    }
    if (this.snoozed && now >= this.snoozeUntil) this.issue(this.snoozed, snapshot, now);
    if (snapshot.phase === 'breakReady' && !this.completed)
      this.issue('sessionComplete', snapshot, now);
    else if (
      snapshot.phase === 'focus' &&
      snapshot.focusElapsedMs - this.acknowledgedFocus >= this.config.intervalMinutes * 60_000
    )
      this.issue('scheduled', snapshot, now);
  }
  screenAdvice(suggest: boolean, snapshot: SessionSnapshot, now: number) {
    this.observe(snapshot, now);
    if (
      !suggest ||
      this.config.quiet ||
      snapshot.phase !== 'focus' ||
      snapshot.focusElapsedMs < 600_000
    ) {
      this.votes = 0;
      return;
    }
    // Two separate observations, at least a minute apart, within five minutes.
    if (now - this.lastVote < 60_000) return;
    this.votes = now - this.lastVote <= 300_000 ? this.votes + 1 : 1;
    this.lastVote = now;
    if (this.votes >= 2) {
      this.issue('screenContext', snapshot, now);
      this.votes = 0;
    }
  }
  dismiss() {
    this.reason = null;
    this.votes = 0;
    this.snoozed = null;
    this.lastVote = -Infinity;
  }
  snooze(now: number) {
    this.snoozed = this.reason;
    this.reason = null;
    this.snoozeUntil = now + 600_000;
    this.votes = 0;
  }
}
