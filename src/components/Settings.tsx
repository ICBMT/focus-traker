import { useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  HardDrive,
  Heart,
  LockKeyhole,
  Monitor,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Unplug,
  WifiOff,
} from 'lucide-react';
import type { AiConnection } from '../core/ai';
import type { RuntimeInfo, Settings as Preferences } from '../core/types';
import { runtime } from '../lib/runtime';
import { Button, Modal, Pill, Toggle } from './ui';
import CompanionSettings from './CompanionSettings';
import type { CompanionController } from '../hooks/useCompanion';
import type { SessionSnapshot } from '../core/types';

export default function Settings({
  initialTab = 'general',
  companion,
  session,
  onRest,
  settings,
  info,
  canSave,
  ai,
  onAiChange,
  onUpdate,
  onExport,
  onClear,
  onNotice,
}: {
  initialTab?: string;
  companion: CompanionController;
  session: SessionSnapshot;
  onRest: () => void;
  settings: Preferences;
  info: RuntimeInfo;
  canSave: boolean;
  ai: AiConnection;
  onAiChange: (patch: Partial<AiConnection>) => void;
  onUpdate: (patch: Partial<Preferences>) => void;
  onExport: () => void;
  onClear: (all: boolean) => Promise<boolean>;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [confirm, setConfirm] = useState<'history' | 'all' | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [port, setPort] = useState(String(ai.port));
  const [connectionError, setConnectionError] = useState('');
  const [licenses, setLicenses] = useState<string | null>(null);
  const openLicenses = async () => {
    setLicenses('Loading bundled license notices…');
    try {
      const response = await fetch('/licenses/ALL-THIRD-PARTY-NOTICES.txt');
      if (!response.ok) throw new Error('Not available');
      setLicenses(await response.text());
    } catch {
      setLicenses(
        'Bundled notices could not be loaded. The installation archive and source repository include license information. No external request was made.',
      );
    }
  };
  const connect = async () => {
    const number = Number(port);
    if (!Number.isInteger(number) || number < 1 || number > 65535) {
      setConnectionError('Choose a port between 1 and 65535.');
      return;
    }
    setConnecting(true);
    setConnectionError('');
    try {
      const models = await runtime.models(number);
      onAiChange({
        port: number,
        models,
        model: models.some((m) => m.name === ai.model) ? ai.model : (models[0]?.name ?? ''),
        connected: true,
        source: models.length ? 'ollama' : 'offline',
      });
      onNotice(
        models.length
          ? `${models.length} installed local-model candidates found. Inference has not been benchmarked.`
          : 'Ollama is reachable, but no eligible installed model was found. Nothing was downloaded.',
      );
    } catch (error) {
      setConnectionError(
        typeof error === 'string'
          ? error
          : error instanceof Error
            ? error.message
            : 'The local endpoint could not be reached.',
      );
    } finally {
      setConnecting(false);
    }
  };
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">MAKE YOURSELF AT HOME</div>
        <h1>Your space. Your preferences.</h1>
        <p>Choose what helps. Leave the rest. Everything starts with you.</p>
      </div>
      <div className="settings-layout">
        <div className="settings-nav" aria-label="Settings categories">
          {[
            { id: 'general', icon: SlidersHorizontal, label: 'Your rhythm' },
            { id: 'desktop', icon: Monitor, label: 'Desktop companion' },
            { id: 'ai', icon: Sparkles, label: 'AI & companion' },
            { id: 'privacy', icon: ShieldCheck, label: 'Privacy & data' },
            { id: 'about', icon: Heart, label: 'About Focus' },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
            >
              <item.icon size={17} />
              {item.label}
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
        <div className="settings-content">
          {tab === 'desktop' && (
            <CompanionSettings
              controller={companion}
              settings={settings}
              session={session}
              info={info}
              ai={ai}
              onUpdate={onUpdate}
              onRest={onRest}
            />
          )}
          {tab === 'general' && (
            <>
              <section className="card settings-card">
                <div className="card-heading">
                  <div>
                    <h2>A rhythm that feels like you</h2>
                    <p>Comfortable defaults, not scientifically optimal schedules.</p>
                  </div>
                  <SlidersHorizontal size={20} className="green-text" />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Work-session duration</strong>
                    <p>Room for one meaningful next step.</p>
                  </div>
                  <select
                    aria-label="Default work-session duration"
                    value={settings.focusMinutes}
                    onChange={(e) => onUpdate({ focusMinutes: Number(e.target.value) })}
                  >
                    {[...new Set([15, 25, 45, 50, 90, settings.focusMinutes])]
                      .sort((a, b) => a - b)
                      .map((n) => (
                        <option value={n} key={n}>
                          {n} minutes
                        </option>
                      ))}
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>A little recharge</strong>
                    <p>Breaks stay optional and easy to end.</p>
                  </div>
                  <select
                    aria-label="Default break duration"
                    value={settings.breakMinutes}
                    onChange={(e) => onUpdate({ breakMinutes: Number(e.target.value) })}
                  >
                    {[1, 3, 5, 10, 15].map((n) => (
                      <option value={n} key={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Daily intention</strong>
                    <p>A gentle reference, never a productivity grade.</p>
                  </div>
                  <select
                    aria-label="Daily session-time intention"
                    value={settings.dailyGoalMinutes}
                    onChange={(e) => onUpdate({ dailyGoalMinutes: Number(e.target.value) })}
                  >
                    {[30, 60, 90, 120, 180, 240, 480].map((n) => (
                      <option value={n} key={n}>
                        {n < 60 ? `${n} minutes` : `${n / 60} ${n === 60 ? 'hour' : 'hours'}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Focus protection</strong>
                    <p>Quiet this app’s discretionary prompts. Other apps are unaffected.</p>
                  </div>
                  <Toggle
                    label="Focus protection"
                    checked={settings.protectFocus}
                    onChange={(protectFocus) => onUpdate({ protectFocus })}
                  />
                </div>
              </section>
              <section className="card settings-card">
                <div className="card-heading">
                  <div>
                    <h2>A calmer look and feel</h2>
                    <p>Less visual noise. More breathing room.</p>
                  </div>
                  <Sun size={20} className="green-text" />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Appearance</strong>
                    <p>Choose the light that feels comfortable.</p>
                  </div>
                  <div className="theme-picker">
                    {(
                      [
                        { value: 'light', icon: Sun, label: 'Light' },
                        { value: 'dark', icon: Moon, label: 'Dark' },
                        { value: 'system', icon: Monitor, label: 'System' },
                      ] as const
                    ).map((theme) => (
                      <button
                        type="button"
                        key={theme.value}
                        className={settings.theme === theme.value ? 'active' : ''}
                        aria-pressed={settings.theme === theme.value}
                        onClick={() => onUpdate({ theme: theme.value })}
                      >
                        <theme.icon size={16} />
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Reduce motion</strong>
                    <p>Keep transitions still. OS reduced-motion preferences also apply.</p>
                  </div>
                  <Toggle
                    label="Reduce motion"
                    checked={settings.reduceMotion}
                    onChange={(reduceMotion) => onUpdate({ reduceMotion })}
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Autostart & desktop effects</strong>
                    <p>
                      Not enabled in this first slice. No hidden startup monitoring or screen glow.
                    </p>
                  </div>
                  <Pill tone="neutral">Not configured</Pill>
                </div>
              </section>
            </>
          )}
          {tab === 'ai' && (
            <>
              <section className="card settings-card">
                <div className="card-heading">
                  <div>
                    <h2>A companion, on your terms</h2>
                    <p>Explicit conversations. No sensing data or autonomous tools.</p>
                  </div>
                  <Sparkles size={20} className="green-text" />
                </div>
                <div className="provider-options">
                  <button
                    type="button"
                    className={`provider-option ${ai.source === 'offline' ? 'selected' : ''}`}
                    onClick={() => onAiChange({ source: 'offline' })}
                  >
                    <span className="provider-radio" />
                    <WifiOff size={22} />
                    <div>
                      <strong>Offline guidance</strong>
                      <p>Small, hand-written starting points. No model, account, or connection.</p>
                    </div>
                    {ai.source === 'offline' && <Check size={18} />}
                  </button>
                  <button
                    type="button"
                    className={`provider-option ${ai.source === 'ollama' ? 'selected' : ''}`}
                    disabled={!ai.connected || !ai.model}
                    onClick={() => onAiChange({ source: 'ollama' })}
                  >
                    <span className="provider-radio" />
                    <HardDrive size={22} />
                    <div>
                      <strong>Local Ollama</strong>
                      <p>
                        {ai.connected
                          ? 'Use the selected installed model in the desktop host.'
                          : 'Connect deliberately in the desktop app.'}
                      </p>
                    </div>
                    {ai.source === 'ollama' && <Check size={18} />}
                  </button>
                </div>
                <div className="provider-setup">
                  <h3>Connect your local model</h3>
                  <p>
                    Rust connects to <code>127.0.0.1</code> only. This hosted web preview never
                    calls your computer’s localhost.
                  </p>
                  {info.kind === 'web' && (
                    <div className="inline-info">
                      <Monitor size={17} />
                      <span>Native app required. Offline guidance works in this preview.</span>
                    </div>
                  )}
                  <label className="field-label" htmlFor="ollama-port">
                    Ollama port
                  </label>
                  <div className="endpoint-input">
                    <span>http://127.0.0.1:</span>
                    <input
                      id="ollama-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={port}
                      onChange={(e) => {
                        setPort(e.target.value);
                        onAiChange({ connected: false, source: 'offline' });
                      }}
                      disabled={connecting}
                    />
                  </div>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={ai.acknowledged}
                      onChange={(e) =>
                        onAiChange({
                          acknowledged: e.target.checked,
                          connected: false,
                          source: 'offline',
                        })
                      }
                    />
                    <span>
                      I understand a loopback server can use cloud-backed routes. I’ll configure
                      Ollama’s no-cloud settings for local-only use.
                    </span>
                  </label>
                  <Button
                    variant="secondary"
                    disabled={info.kind !== 'desktop' || !ai.acknowledged || connecting}
                    onClick={() => void connect()}
                  >
                    {connecting ? <span className="spinner" /> : <HardDrive size={16} />}
                    {connecting ? 'Checking endpoint…' : 'Discover installed models'}
                  </Button>
                  {connectionError && (
                    <div className="inline-warning" role="status">
                      {connectionError}
                    </div>
                  )}
                  {ai.connected && (
                    <div className="model-choice">
                      <label className="field-label" htmlFor="ollama-model">
                        Installed model
                      </label>
                      <select
                        id="ollama-model"
                        value={ai.model}
                        onChange={(e) => onAiChange({ model: e.target.value })}
                      >
                        {ai.models.length ? (
                          ai.models.map((model) => (
                            <option value={model.name} key={model.name}>
                              {model.name}
                              {model.size > 0
                                ? ` · ${(model.size / 1e9).toFixed(1)} GB download`
                                : ''}
                            </option>
                          ))
                        ) : (
                          <option value="">No eligible installed models</option>
                        )}
                      </select>
                      <p>
                        No automatic downloads. Known cloud tags are excluded, but server-side
                        routing is not independently verified.
                      </p>
                      {ai.model.startsWith('qwen2.5-coder:3b') && (
                        <div className="inline-warning">
                          This model has Qwen Research License restrictions. Review its license
                          before commercial or non-research use.
                        </div>
                      )}
                      <button
                        className="text-link"
                        onClick={() =>
                          onAiChange({ connected: false, model: '', models: [], source: 'offline' })
                        }
                      >
                        <Unplug size={14} />
                        Disconnect model
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <section className="card planned-provider">
                <LockKeyhole size={25} />
                <div>
                  <h3>Bring-your-own-key providers come next.</h3>
                  <p>
                    Remote protocols and native credential storage are not integrated yet. This
                    version does not collect API keys or save credentials in browser storage.
                  </p>
                </div>
                <Pill tone="neutral">Not enabled</Pill>
              </section>
            </>
          )}
          {tab === 'privacy' && (
            <>
              <section className="card settings-card">
                <div className="card-heading">
                  <div>
                    <h2>Your attention isn’t a data product.</h2>
                    <p>Local-first by design, with honest limits.</p>
                  </div>
                  <ShieldCheck size={21} className="green-text" />
                </div>
                <div className="privacy-promises">
                  <span>
                    <Check size={16} />
                    No camera recordings. Screen sharing needs separate consent.
                  </span>
                  <span>
                    <Check size={16} />
                    No typed-text collection or input traces.
                  </span>
                  <span>
                    <Check size={16} />
                    No analytics, advertising, or hidden telemetry.
                  </span>
                  <span>
                    <Check size={16} />
                    No default chat or sensor-window history.
                  </span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Keep session history</strong>
                    <p>
                      Work/break summaries stay locally for 30 days. Turning this off clears saved
                      summaries.
                    </p>
                  </div>
                  <Toggle
                    label="Keep session history"
                    checked={settings.keepHistory}
                    onChange={(keepHistory) => onUpdate({ keepHistory })}
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Storage location</strong>
                    <p>
                      {info.kind === 'desktop'
                        ? 'Versioned JSON in the OS app-data directory. Credentials are not collected. SQLite migration is a later milestone.'
                        : 'This browser profile’s local storage, separate from a future desktop installation.'}
                    </p>
                  </div>
                  <Pill tone={canSave ? 'green' : 'amber'}>
                    {canSave ? 'Local storage' : 'Temporary / read-only'}
                  </Pill>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Export your workspace</strong>
                    <p>
                      Includes intentions, preferences, and session summaries. Preview fields in the
                      documentation; keep task text private.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={onExport}>
                    <ArrowDownToLine size={15} />
                    Export JSON
                  </Button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Clear session history</strong>
                    <p>Stops the current session and removes work/break summaries.</p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setClearError('');
                      setConfirm('history');
                    }}
                  >
                    <Trash2 size={15} />
                    Clear history
                  </Button>
                </div>
                <div className="setting-row danger-row">
                  <div>
                    <strong>Start completely fresh</strong>
                    <p>
                      Stops tests and sessions; resets intentions, history, preferences, and
                      recovery state.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setClearError('');
                      setConfirm('all');
                    }}
                  >
                    <Trash2 size={15} />
                    Delete all data
                  </Button>
                </div>
              </section>
              <div className="privacy-note">
                <CircleHelp size={18} />
                <p>
                  Local storage is not encrypted by this app. Use OS disk encryption for sensitive
                  tasks. Deletion cannot guarantee forensic erasure from device storage, backups,
                  swap, or exports. Browser-preview data is not synchronized with the desktop app.
                </p>
              </div>
            </>
          )}
          {tab === 'about' && (
            <section className="card about-card">
              <img src="/icon.svg" width="68" height="68" alt="Focus logo" />
              <div className="eyebrow">A LITTLE MORE PRESENT</div>
              <h2>Less noise. More meaningful work.</h2>
              <p>
                Focus is a personal, local-first work companion. It makes room for your next step
                without grading your attention or turning rest into something you have to earn.
              </p>
              <div className="about-version">
                <Pill>Candidate · v0.1.0</Pill>
                <Pill tone="neutral">MIT licensed</Pill>
                <Pill tone="neutral">Rust + Tauri + React</Pill>
              </div>
              <div className="about-status">
                <Database size={19} />
                <p>
                  This first slice includes sessions, local summaries, offline guidance, a
                  foreground camera test, and a test-pad-only input experiment. Native sensor
                  adapters, vision inference, secure provider keys, and real notification-source
                  integration are not implemented.
                </p>
              </div>
              <Button variant="secondary" onClick={() => void openLicenses()}>
                Open-source licenses
              </Button>
              <span className="about-signoff">
                Built for your pace, not someone else’s expectations.
              </span>
            </section>
          )}
        </div>
      </div>
      {licenses !== null && (
        <Modal
          title="Open-source licenses"
          eyebrow="BUNDLED NOTICES"
          onClose={() => setLicenses(null)}
        >
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              maxHeight: '55vh',
              overflowY: 'auto',
              fontSize: 12,
              lineHeight: 1.6,
            }}
            tabIndex={0}
          >
            {licenses}
          </pre>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm === 'all' ? 'A completely fresh start?' : 'Clear the steps you’ve recorded?'
          }
          eyebrow="YOUR DATA, YOUR CHOICE"
          onClose={() => {
            if (!clearing) setConfirm(null);
          }}
        >
          <p className="modal-description">
            {confirm === 'all'
              ? 'Your intentions, session summaries, preferences, and recovery checkpoint will be reset. Active sessions and sensor tests stop. This cannot be undone.'
              : 'Session summaries and the active timer will be cleared. Intentions and preferences stay. This cannot be undone.'}{' '}
            Existing exports and third-party backups are not deleted.
          </p>
          {clearError && (
            <div className="inline-warning" role="alert">
              {clearError}
            </div>
          )}
          <div className="modal-actions">
            <Button variant="ghost" disabled={clearing} onClick={() => setConfirm(null)}>
              Keep my data
            </Button>
            <Button
              variant="danger"
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  const cleared = await onClear(confirm === 'all');
                  if (cleared) setConfirm(null);
                  else
                    setClearError(
                      'Data could not be cleared. Automatic writes are paused; check storage permissions and try again.',
                    );
                } finally {
                  setClearing(false);
                }
              }}
            >
              <Trash2 size={16} />
              {clearing ? 'Clearing…' : confirm === 'all' ? 'Delete all data' : 'Clear history'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
