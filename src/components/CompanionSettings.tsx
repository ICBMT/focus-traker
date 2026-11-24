import { useState } from 'react';
import { Coffee, Eye, Monitor, ShieldCheck, Sparkles } from 'lucide-react';
import type { AiConnection } from '../core/ai';
import type { RuntimeInfo, SessionSnapshot, Settings } from '../core/types';
import type { CompanionController } from '../hooks/useCompanion';
import { companionRuntime } from '../lib/companion';
import { Button, Modal, Pill, Toggle } from './ui';

export default function CompanionSettings({
  controller: c,
  settings,
  session,
  info,
  ai,
  onUpdate,
  onRest,
}: {
  controller: CompanionController;
  settings: Settings;
  session: SessionSnapshot;
  info: RuntimeInfo;
  ai: AiConnection;
  onUpdate: (patch: Partial<Settings>) => void;
  onRest: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [install, setInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState('');
  const aiReady = ai.acknowledged && ai.connected && ai.source === 'ollama' && !!ai.model;
  const canShare =
    c.screenSupported &&
    aiReady &&
    settings.overlayEnabled &&
    session.phase === 'focus' &&
    !c.presentation;
  const isLinux = info.kind === 'desktop' && info.platform === 'linux';
  return (
    <>
      <section className="card settings-card">
        <div className="card-heading">
          <div>
            <h2>A little company, out of the way</h2>
            <p>A timer within reach. Never a lock screen or a demand.</p>
          </div>
          <Monitor size={22} className="green-text" />
        </div>
        <div className="setting-row">
          <div>
            <strong>Desktop corner timer</strong>
            <p>
              {info.kind === 'web'
                ? 'This preview demonstrates an in-page timer only. Across-app overlay needs the installed desktop app.'
                : 'Hover or focus the small tab to reveal your timer and voluntary rest controls. No global mouse tracking.'}
            </p>
          </div>
          <Toggle
            label="Desktop corner timer"
            checked={settings.overlayEnabled}
            onChange={(overlayEnabled) => onUpdate({ overlayEnabled })}
          />
        </div>
        <div className="companion-capability" role="status">
          <Pill tone={c.status.gnomeConnected ? 'green' : 'neutral'} dot>
            {c.status.gnomeConnected
              ? 'GNOME companion connected'
              : info.kind === 'web'
                ? 'Browser · inside this page only'
                : info.sessionType === 'wayland'
                  ? 'Wayland · compact-window fallback'
                  : 'Native corner placement requested'}
          </Pill>
          <p>
            {info.sessionType === 'wayland'
              ? 'Wayland can ignore window position and always-on-top requests. The GNOME extension provides the actual edge-hover layer. Without it, use the movable compact timer; placement is not guaranteed.'
              : 'Window managers, full-screen apps, monitor layouts and OS policies may restrict placement. Physical multi-monitor/DPI validation is still needed.'}
          </p>
        </div>
        {isLinux && (
          <div className="setting-row">
            <div>
              <strong>GNOME / Wayland integration</strong>
              <p>
                Bundled optional extension targeting GNOME Shell 45–50. Installation does not enable
                it or change system permissions.
              </p>
              <code>focus-companion@icbmt</code>
            </div>
            <Button variant="secondary" onClick={() => setInstall(true)}>
              Install GNOME companion…
            </Button>
          </div>
        )}
        {installResult && (
          <p className="inline-warning" role="status">
            {installResult}
          </p>
        )}
        <div className="setting-row">
          <div>
            <strong>Gentle break invitations</strong>
            <p>
              Based on your chosen work time, never a claim that you’re tired. At most three per
              hour, at least ten minutes apart; snooze or dismiss anytime.
            </p>
          </div>
          <Toggle
            label="Gentle break invitations"
            checked={settings.gentleReminders}
            onChange={(gentleReminders) => onUpdate({ gentleReminders })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Invitation interval</strong>
            <p>Active work time only. A completed focus timer can also offer a pause.</p>
          </div>
          <select
            aria-label="Break invitation interval"
            value={settings.reminderMinutes}
            onChange={(e) => onUpdate({ reminderMinutes: Number(e.target.value) })}
          >
            {[...new Set([10, 15, 25, 45, 60, 90, settings.reminderMinutes])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>Presentation mode</strong>
            <p>
              Hide the companion, silence invitations, and stop screen sharing. Sharing never
              restarts automatically.
            </p>
          </div>
          <Toggle label="Presentation mode" checked={c.presentation} onChange={c.setPresentation} />
        </div>
        <Button variant="secondary" onClick={onRest}>
          <Coffee size={16} />
          Open my rest space
        </Button>
        {c.error && (
          <p className="inline-warning" role="status">
            {c.error}
          </p>
        )}
      </section>
      <section className="card settings-card">
        <div className="card-heading">
          <div>
            <h2>Context, only with your permission</h2>
            <p>Optional screen-aware suggestions. Off every time you launch Focus.</p>
          </div>
          <Eye size={22} className="green-text" />
        </div>
        <div className="screen-consent-summary">
          <ShieldCheck size={21} />
          <p>
            Choose one window or monitor in the OS sharing dialog. While your work timer runs, at
            most one reduced-resolution image every 90 seconds goes to your chosen vision model. No
            audio, saved screenshots, OCR archive, or hidden capture fallback.
          </p>
        </div>
        <div className="setting-row">
          <div>
            <strong>
              {c.sharing
                ? 'Screen context is ON'
                : c.starting
                  ? 'Waiting for the system chooser'
                  : 'Screen context is off'}
            </strong>
            <p>
              {c.sharing
                ? `Selected source → ${ai.model}. ${c.analyzing ? 'Waiting for the model…' : 'Sampling automatically during this work session.'}`
                : c.screenSupported
                  ? 'Requires a running work timer, the desktop companion, and an explicitly connected vision-capable Ollama model. Optional Python/GStreamer dependencies are checked before the chooser.'
                  : 'Automatic screen context currently requires the Linux desktop app with portal/PipeWire support. It is not available in this preview or the Windows/macOS webviews.'}
            </p>
          </div>
          {c.sharing || c.starting ? (
            <Button variant="secondary" onClick={() => void c.stop()}>
              {c.starting ? 'Cancel screen sharing' : 'Stop sharing'}
            </Button>
          ) : (
            <Button disabled={!canShare} onClick={() => setConsent(true)}>
              <Sparkles size={16} />
              Set up screen context…
            </Button>
          )}
        </div>
        {c.screenError && (
          <p className="inline-warning" role="status">
            {c.screenError}
          </p>
        )}
        {c.advice && (
          <div className="screen-observation" aria-live="polite">
            <Pill tone="neutral">AI suggestion · not a detection</Pill>
            <p>{c.advice.message}</p>
            <small>
              {c.advice.observation}
              {c.observedAt
                ? ` · ${new Date(c.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
              . May be mistaken.
            </small>
          </div>
        )}
        <p className="settings-explainer">
          Focus protection silences screen-model nudges, not the timer invitations you explicitly
          enable. Two separate model suggestions are needed before a screen-based invitation. Screen
          content cannot change settings, run tools, or force a break.
        </p>
        <p className="settings-explainer">
          Sharing ends on pause, rest/chat, presentation mode, model change, system-share closure,
          app close, or restart. Linux lock/sleep signals also close the share where available. To
          resume, choose a source again. A model timeout or missing dependency stops safely instead
          of substituting a fake assessment.
        </p>
      </section>
      {consent && (
        <Modal
          title="Share a small window into your work?"
          eyebrow="SEPARATE SCREEN-CONTEXT CONSENT"
          onClose={() => setConsent(false)}
        >
          <p className="modal-description">
            This is automatic sampling, not just a one-time screenshot. The selected window or
            monitor can contain private messages, passwords, names, or other sensitive information.
            Prefer a single non-sensitive window and close confidential content first. There is no
            automatic redaction.
          </p>
          <div className="screen-consent-summary">
            <Monitor size={23} />
            <p>
              One live OS share, reduced locally to 960 × 540 at about 1 fps; at most one image
              every 90 seconds is sent to the model during active work. Images and short model
              descriptions stay out of Focus’s saved data, exports, and logs. They are still visible
              to the Ollama server: its logs, memory, plugins, and routing are outside Focus’s
              control.
            </p>
          </div>
          <p className="modal-description">
            Destination:{' '}
            <strong>
              127.0.0.1:{ai.port} · {ai.model}
            </strong>
            . Focus verifies advertised vision support and rejects declared cloud routes, but a
            loopback address does not prove local-only inference. Configure Ollama for no-cloud use.
            Generated text may be wrong or quote sensitive information despite safeguards.
          </p>
          <p className="modal-description">
            A sharing indicator and Stop sharing remain available in Focus and the desktop timer.
            This permission is not saved. The system chooser may identify the capture helper as
            Python rather than Focus.
          </p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setConsent(false)}>
              Not now
            </Button>
            <Button
              disabled={!canShare}
              onClick={() => {
                setConsent(false);
                void c.start();
              }}
            >
              I agree · choose a window
            </Button>
          </div>
        </Modal>
      )}
      {install && (
        <Modal
          title="Install the optional GNOME companion?"
          eyebrow="USER-LEVEL DESKTOP INTEGRATION"
          onClose={() => {
            if (!installing) setInstall(false);
          }}
        >
          <p className="modal-description">
            Write or replace the bundled extension files and MIT license under your user data
            directory’s <code>gnome-shell/extensions/focus-companion@icbmt</code> folder. No
            administrator access, automatic activation, autostart, or system-wide changes. The
            extension reads only a redacted timer and can request the same voluntary controls shown
            here.
          </p>
          <p className="modal-description">
            On Wayland, log out and back in if needed, then enable “Focus desktop companion” in
            GNOME Extensions. Older GNOME releases and non-GNOME compositors keep the compact-window
            fallback. Physical GNOME validation is still a release gate.
          </p>
          <div className="modal-actions">
            <Button variant="ghost" disabled={installing} onClick={() => setInstall(false)}>
              Cancel
            </Button>
            <Button
              disabled={installing}
              onClick={async () => {
                setInstalling(true);
                try {
                  setInstallResult(await companionRuntime.installGnome());
                  setInstall(false);
                } catch (e) {
                  setInstallResult(
                    typeof e === 'string'
                      ? e
                      : e instanceof Error
                        ? e.message
                        : 'The extension could not be installed.',
                  );
                } finally {
                  setInstalling(false);
                }
              }}
            >
              {installing ? 'Installing files…' : 'Install bundled files'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
