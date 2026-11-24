import { isTauri, invoke } from '@tauri-apps/api/core';
import { BrowserSession } from '../core/session';
import { loadBrowserWorkspace, parseWorkspace, saveBrowserWorkspace } from '../core/storage';
import { BrowserWorkspaceLease } from '../core/lease';
import type {
  ChatMessage,
  OllamaModel,
  RuntimeInfo,
  SessionSnapshot,
  StartOptions,
  Workspace,
} from '../core/types';
import type { RhythmBaseline, RhythmResult, RhythmSummary } from '../core/rhythm';
import { compareRhythm } from '../core/rhythm';

export const desktop = isTauri();
const browserSession = new BrowserSession();
const browserLease = new BrowserWorkspaceLease();
let browserPageHide: (() => void) | null = null;
if (!desktop) {
  window.addEventListener('pagehide', () => {
    try {
      browserPageHide?.();
    } finally {
      // Flush and release in the SAME listener. Browsers can run a microtask
      // checkpoint between separate event listeners and release too early.
      browserLease.release();
    }
  });
  window.addEventListener('pageshow', (event) => {
    // A BFCache document no longer owns its old writer lock. Re-read data and
    // reacquire before allowing edits rather than reviving stale state.
    if (event.persisted) window.location.reload();
  });
}
function saveBrowser(data: Workspace): void {
  if (!browserLease.writable)
    throw new Error('This tab does not own the workspace. Close the editing tab and reload.');
  saveBrowserWorkspace(data);
}

export const runtime = {
  async info(): Promise<RuntimeInfo> {
    if (desktop) return invoke('runtime_info');
    return {
      kind: 'web',
      engine: 'browser',
      platform: 'Browser preview',
      sessionType: 'window-only',
    };
  },
  async load(): Promise<{ data: Workspace; warning?: string; readOnly?: boolean }> {
    if (!desktop) {
      const lease = await browserLease.acquire(navigator.locks);
      const stored = loadBrowserWorkspace();
      return lease.writable ? stored : { ...stored, readOnly: true, warning: lease.warning };
    }
    const data = await invoke<unknown>('load_workspace');
    return { data: parseWorkspace(data) };
  },
  async save(data: Workspace): Promise<void> {
    if (desktop) await invoke('save_workspace', { data });
    else saveBrowser(data);
  },
  async requestClose(): Promise<void> {
    if (!desktop) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  },
  async forceClose(): Promise<void> {
    if (!desktop) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().destroy();
  },
  async onCloseRequested(
    prepare: () => Promise<boolean>,
    failed: (message: string) => void,
  ): Promise<() => void> {
    if (!desktop) return () => {};
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const window = getCurrentWindow();
    let closing = false;
    return window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      try {
        if (await prepare()) await window.destroy();
      } catch {
        failed('The window could not close cleanly. Your workspace remains open; please retry.');
      } finally {
        closing = false;
      }
    });
  },
  onPageHide(
    prepare: (snapshot: SessionSnapshot) => Workspace | null,
    failed: (message: string) => void,
  ): () => void {
    if (desktop) return () => {};
    const handler = () => {
      if (!browserLease.writable) return;
      try {
        const data = prepare(browserSession.pause());
        if (data) saveBrowser(data);
      } catch {
        failed('The final browser save failed. Recent changes may not survive closing this tab.');
      }
    };
    browserPageHide = handler;
    return () => {
      if (browserPageHide === handler) browserPageHide = null;
    };
  },
  async snapshot(): Promise<SessionSnapshot> {
    return desktop ? invoke('session_snapshot') : browserSession.snapshot();
  },
  async start(options: StartOptions): Promise<SessionSnapshot> {
    return desktop ? invoke('start_session', { options }) : browserSession.start(options);
  },
  async reset(): Promise<SessionSnapshot> {
    return desktop ? invoke('reset_session') : browserSession.reset();
  },
  async pause(): Promise<SessionSnapshot> {
    return desktop ? invoke('pause_session') : browserSession.pause();
  },
  async resume(): Promise<SessionSnapshot> {
    return desktop ? invoke('resume_session') : browserSession.resume();
  },
  async finish(): Promise<SessionSnapshot> {
    return desktop ? invoke('finish_session') : browserSession.finish();
  },
  async startBreak(id: string, durationMs: number): Promise<SessionSnapshot> {
    return desktop
      ? invoke('start_break', { id, durationMs })
      : browserSession.startBreak(id, durationMs);
  },
  async restore(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
    return desktop ? invoke('restore_session', { snapshot }) : browserSession.restore(snapshot);
  },
  async rhythm(summary: RhythmSummary, baseline: RhythmBaseline | null): Promise<RhythmResult> {
    return desktop
      ? invoke('compare_rhythm', { summary, baseline })
      : compareRhythm(summary, baseline);
  },
  async models(port: number): Promise<OllamaModel[]> {
    if (!desktop)
      throw new Error(
        'Ollama connections are available in the desktop app. This hosted preview cannot access the model server on your computer.',
      );
    return invoke('ollama_models', { port });
  },
  async chat(
    port: number,
    model: string,
    messages: ChatMessage[],
    task: string | null,
  ): Promise<string> {
    if (!desktop)
      throw new Error(
        'Local AI needs the desktop app. Offline guidance is available here without a connection.',
      );
    return invoke('ollama_chat', { port, model, messages, task });
  },
  async stopChat(): Promise<void> {
    if (desktop) await invoke('cancel_chat');
  },
  async export(data: Workspace): Promise<string | null> {
    if (desktop) return invoke('export_workspace', { data });
    const clean = { ...parseWorkspace(data), checkpoint: null };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `focus-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Your download contains intentions, preferences, and session summaries—never sensor data or credentials.';
  },
};
