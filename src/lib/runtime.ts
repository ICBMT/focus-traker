import { isTauri, invoke } from '@tauri-apps/api/core';
import { BrowserSession } from '../core/session';
import { loadBrowserWorkspace, parseWorkspace, saveBrowserWorkspace } from '../core/storage';
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
    if (!desktop) return loadBrowserWorkspace();
    const data = await invoke<unknown>('load_workspace');
    return { data: parseWorkspace(data) };
  },
  async save(data: Workspace): Promise<void> {
    if (desktop) await invoke('save_workspace', { data });
    else saveBrowserWorkspace(data);
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
