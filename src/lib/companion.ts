import { invoke, isTauri } from '@tauri-apps/api/core';
import { CompanionPolicy } from '../core/companion';
import type {
  CompanionAction,
  CompanionConfig,
  CompanionStatus,
  ScreenAdvice,
} from '../core/companion';
import { emptySession } from '../core/types';
import type { SessionSnapshot } from '../core/types';

const native = isTauri();
const policy = new CompanionPolicy();
export interface ScreenStatus {
  supported: boolean;
  active: boolean;
  starting: boolean;
}
const browserStatus = (session = emptySession()): CompanionStatus => {
  policy.observe(session, performance.now());
  return {
    config: policy.config,
    phase: session.phase,
    remainingMs: session.remainingMs,
    reason: policy.reason,
    screenSharing: false,
    gnomeConnected: false,
    placement: 'browser',
  };
};
export const companionRuntime = {
  async configure(config: CompanionConfig, session?: SessionSnapshot): Promise<CompanionStatus> {
    if (native) return invoke('companion_configure', { config });
    policy.configure(config);
    return browserStatus(session);
  },
  async status(session?: SessionSnapshot): Promise<CompanionStatus> {
    return native ? invoke('companion_status') : browserStatus(session);
  },
  async action(action: CompanionAction): Promise<void> {
    if (native) return invoke('companion_action', { action });
    if (action === 'snooze') policy.snooze(performance.now());
    if (['dismiss', 'rest', 'talk', 'disable'].includes(action)) policy.dismiss();
    window.dispatchEvent(new CustomEvent('focus:companion-action', { detail: action }));
  },
  async expand(expanded: boolean): Promise<void> {
    if (native) await invoke('companion_expand', { expanded });
  },
  async onAction(callback: (action: CompanionAction) => void): Promise<() => void> {
    if (native) {
      const { listen } = await import('@tauri-apps/api/event');
      return listen<CompanionAction>('focus:companion-action', (event) => callback(event.payload));
    }
    const handler = (event: Event) => callback((event as CustomEvent<CompanionAction>).detail);
    window.addEventListener('focus:companion-action', handler);
    return () => window.removeEventListener('focus:companion-action', handler);
  },
  async installGnome(): Promise<string> {
    if (!native)
      throw new Error('Install the native Linux app to use the GNOME desktop companion.');
    return invoke('companion_install_gnome');
  },
  async screenStatus(): Promise<ScreenStatus> {
    return native ? invoke('screen_status') : { supported: false, active: false, starting: false };
  },
  async startScreen(port: number, model: string): Promise<void> {
    if (!native)
      throw new Error(
        'Automatic screen context is available only in the native Linux app, not this browser preview.',
      );
    return invoke('screen_start', { port, model, consented: true });
  },
  async stopScreen(): Promise<void> {
    if (native) await invoke('screen_stop');
  },
  async analyzeScreen(): Promise<ScreenAdvice> {
    if (!native) throw new Error('Screen context requires the native Linux app.');
    return invoke('screen_analyze');
  },
};
