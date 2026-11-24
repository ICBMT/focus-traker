import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  HardDrive,
  Keyboard,
  Leaf,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  Sparkles,
  Square,
  Timer,
} from 'lucide-react';
import type { AiConnection } from '../core/ai';
import { isActive } from '../core/types';
import type { RuntimeInfo, SessionSnapshot, Settings } from '../core/types';
import type { CompanionController } from '../hooks/useCompanion';
import { useCameraPreview } from '../hooks/useCameraPreview';
import ModelSetup from './ModelSetup';
import GnomeInstall from './GnomeInstall';
import { Button, Modal, Pill, Toggle } from './ui';

const steps = [
  { title: 'Your rhythm', detail: 'Comfortable defaults', icon: Timer },
  { title: 'Desktop timer', detail: 'Within reach, not in the way', icon: Monitor },
  { title: 'Your companion', detail: 'Offline or a local model', icon: Sparkles },
  { title: 'Permissions', detail: 'Only what you choose', icon: ShieldCheck },
  { title: 'Ready to focus', detail: 'One small next step', icon: Leaf },
];
const titles = [
  'Your pace. Your space.',
  'Keep a little time within reach.',
  'A companion, on your terms.',
  'Nothing extra is required.',
  'Ready when you are.',
];
const descriptions = [
  'A few choices now, less to think about later. You can change every option in Preferences.',
  'Choose an across-app timer and gentle invitations if they help. Neither is required to focus.',
  'Start with offline guidance, or deliberately connect an installed Ollama model. No account or API key is needed.',
  'Your timer, breaks, garden game, and offline guidance work without camera, screen, microphone, or global-input access.',
  'Your workspace is ready for a timer. Optional permissions stay optional—not a checklist you have to complete.',
];
const choices = (base: number[], current: number) =>
  [...new Set([...base, current])].sort((a, b) => a - b);
export interface SetupResult {
  startTimer: boolean;
  screenGuide: boolean;
}

export default function SetupWizard({
  settings,
  info,
  ai,
  companion: c,
  session,
  canSave,
  storageWarning = '',
  onUpdate,
  onAiChange,
  onNotice,
  onActivity,
  onFinish,
  onDismiss,
}: {
  settings: Settings;
  info: RuntimeInfo;
  ai: AiConnection;
  companion: CompanionController;
  session: SessionSnapshot;
  canSave: boolean;
  storageWarning?: string;
  onUpdate: (patch: Partial<Settings>) => void;
  onAiChange: (patch: Partial<AiConnection>) => void;
  onNotice: (message: string) => void;
  onActivity: (active: boolean) => void;
  onFinish: (result: SetupResult) => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [cameraResult, setCameraResult] = useState<'untested' | 'checked' | 'unavailable'>(
    'untested',
  );
  const [screenGuide, setScreenGuide] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const isLinux = info.kind === 'desktop' && info.platform === 'linux';
  const modelReady = ai.acknowledged && ai.connected && ai.source === 'ollama' && !!ai.model;
  const screenPrerequisites = isLinux && settings.overlayEnabled && modelReady && !c.presentation;
  const active = isActive(session.phase);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const next = () => {
    setFurthest(Math.max(furthest, step + 1));
    setStep(step + 1);
  };
  const finish = (startTimer: boolean) =>
    onFinish({ startTimer, screenGuide: startTimer && screenGuide && screenPrerequisites });
  return (
    <Modal
      className="setup-wizard"
      title={settings.setupCompleted ? 'Set up Focus' : 'Welcome to Focus'}
      eyebrow={`YOUR SPACE, YOUR CHOICE · STEP ${step + 1} OF ${steps.length}`}
      onClose={onDismiss}
    >
      <div className="setup-layout">
        <aside className="setup-sidebar" aria-label="Setup progress">
          <ol>
            {steps.map((item, index) => (
              <li key={item.title}>
                <button
                  type="button"
                  disabled={index > furthest}
                  aria-current={index === step ? 'step' : undefined}
                  className={index === step ? 'current' : index < furthest ? 'visited' : ''}
                  onClick={() => setStep(index)}
                >
                  <span className="setup-step-icon">
                    {index < step ? <Check size={17} /> : <item.icon size={18} />}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="setup-sidebar-note">
            <LockKeyhole size={18} />
            <p>No “allow everything.” No hidden monitoring. You’re in control.</p>
          </div>
        </aside>
        <div className="setup-main">
          <div className="setup-step-heading">
            <h3 ref={heading} tabIndex={-1} data-autofocus>
              {titles[step]}
            </h3>
            <p>{descriptions[step]}</p>
          </div>
          {storageWarning && (
            <p className="inline-warning" role="alert">
              {storageWarning}
            </p>
          )}
          {!canSave && (
            <p className="inline-warning" role="status">
              This workspace is temporary/read-only. Choices apply here, but setup cannot be
              remembered. Your original saved data is not being overwritten.
            </p>
          )}
          {step === 0 && (
            <>
              <div className="setup-callout">
                <ShieldCheck size={21} />
                <p>
                  <strong>No special permissions needed to begin.</strong> The timer runs locally.
                  Optional access is explained separately, never bundled into Continue.
                </p>
              </div>
              <div className="setup-fields">
                <label className="setup-field">
                  <span>Focus duration</span>
                  <select
                    aria-label="Setup focus duration"
                    value={settings.focusMinutes}
                    onChange={(e) => onUpdate({ focusMinutes: Number(e.target.value) })}
                  >
                    {choices([15, 25, 45, 50, 90], settings.focusMinutes).map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setup-field">
                  <span>Break duration</span>
                  <select
                    aria-label="Setup break duration"
                    value={settings.breakMinutes}
                    onChange={(e) => onUpdate({ breakMinutes: Number(e.target.value) })}
                  >
                    {choices([1, 3, 5, 10, 15], settings.breakMinutes).map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setup-field">
                  <span>Daily intention</span>
                  <select
                    aria-label="Setup daily intention"
                    value={settings.dailyGoalMinutes}
                    onChange={(e) => onUpdate({ dailyGoalMinutes: Number(e.target.value) })}
                  >
                    {choices([30, 60, 90, 120, 180, 240, 480], settings.dailyGoalMinutes).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n} minutes
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="setup-field">
                  <span>Appearance</span>
                  <select
                    aria-label="Setup appearance"
                    value={settings.theme}
                    onChange={(e) => onUpdate({ theme: e.target.value as Settings['theme'] })}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">Match my system</option>
                  </select>
                </label>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Keep session history</strong>
                  <p>
                    Optional task/time summaries, locally for 30 days. Turning this off clears
                    existing summaries. A paused-session checkpoint can still be saved.
                  </p>
                </div>
                <Toggle
                  label="Setup session history"
                  checked={settings.keepHistory}
                  onChange={(keepHistory) => onUpdate({ keepHistory })}
                />
              </div>
              <div className="setting-row">
                <div>
                  <strong>Reduce motion</strong>
                  <p>Keep transitions still. Your OS motion preference also applies.</p>
                </div>
                <Toggle
                  label="Setup reduced motion"
                  checked={settings.reduceMotion}
                  onChange={(reduceMotion) => onUpdate({ reduceMotion })}
                />
              </div>
              <p className="setup-fine-print">
                Task text is stored as local, unencrypted JSON—not sent to an account or analytics
                service. Use OS disk encryption for sensitive work.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <div className="setting-row">
                <div>
                  <strong>Desktop corner timer</strong>
                  <p>
                    {info.kind === 'web'
                      ? 'This browser preview can show an in-page timer only. Across-app controls need the installed app.'
                      : 'Hover or keyboard-focus the tab to reveal the countdown and voluntary pause/rest controls. No global mouse tracking.'}
                  </p>
                </div>
                <Toggle
                  label="Desktop corner timer"
                  checked={settings.overlayEnabled}
                  onChange={(overlayEnabled) => onUpdate({ overlayEnabled })}
                />
              </div>
              <div className="setting-row">
                <div>
                  <strong>Gentle break invitations</strong>
                  <p>
                    Based on the active work time you choose. Dismiss or snooze; never a forced
                    break or OS lock.
                  </p>
                </div>
                <Toggle
                  label="Gentle break invitations"
                  checked={settings.gentleReminders}
                  onChange={(gentleReminders) => onUpdate({ gentleReminders })}
                />
              </div>
              <label className="setup-field">
                <span>Invitation interval</span>
                <select
                  aria-label="Setup invitation interval"
                  value={settings.reminderMinutes}
                  onChange={(e) => onUpdate({ reminderMinutes: Number(e.target.value) })}
                >
                  {choices([10, 15, 25, 45, 60, 90], settings.reminderMinutes).map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              <div className="setting-row">
                <div>
                  <strong>Focus protection</strong>
                  <p>
                    Quiet discretionary AI suggestions, but keep the timer invitations you
                    explicitly enable. Other apps are unaffected.
                  </p>
                </div>
                <Toggle
                  label="Setup focus protection"
                  checked={settings.protectFocus}
                  onChange={(protectFocus) => onUpdate({ protectFocus })}
                />
              </div>
              <div className="setup-inset">
                <h4>{isLinux ? 'GNOME / Wayland integration' : 'Desktop readiness'}</h4>
                <Pill tone={c.status.gnomeConnected ? 'green' : 'neutral'}>
                  {c.status.gnomeConnected
                    ? 'GNOME connected'
                    : info.kind === 'web'
                      ? 'Preview only'
                      : 'Compact native timer available'}
                </Pill>
                <p>
                  {isLinux
                    ? 'On GNOME, the optional extension provides the true top-right hover layer. Install only if you use GNOME. Installation does not enable it; no administrator permission is needed.'
                    : info.kind === 'web'
                      ? 'There is no OS-overlay permission to grant in this hosted page. The desktop app is a separate installation.'
                      : 'Focus requests corner placement and always-on-top without a broad accessibility permission. Your window manager, full-screen apps, and OS policy can restrict placement.'}
                </p>
                {isLinux && (
                  <>
                    <GnomeInstall inline />
                    <p>
                      Without the extension, Wayland may choose the compact window’s position. The
                      companion stays tucked away while this setup is open.
                    </p>
                  </>
                )}
              </div>
            </>
          )}
          {step === 2 && (
            <div className="setup-model">
              <ModelSetup ai={ai} info={info} onChange={onAiChange} onNotice={onNotice} />
            </div>
          )}
          {step === 3 && (
            <>
              <div className="setup-permissions">
                <Permission
                  icon={HardDrive}
                  title="Local workspace"
                  status={canSave ? 'Available' : 'Temporary only'}
                >
                  <p>
                    {info.kind === 'desktop'
                      ? 'Uses your OS app-data folder, not full-disk access. Exports go through a separate user action.'
                      : 'Uses this browser profile’s local storage, not your files or a synced account.'}
                  </p>
                </Permission>
                <Permission
                  icon={Monitor}
                  title="Screen-aware suggestions"
                  status={isLinux ? 'Ask each work session' : 'Unavailable here'}
                >
                  <p>
                    {isLinux
                      ? 'Not granted by setup. Start a work timer, review separate screen consent, then choose one source in the OS chooser. Pause/close/restart ends the grant.'
                      : 'Screen context currently requires the Linux desktop app. Windows/macOS and this preview keep the timer, rest space, and text guidance without capture.'}
                  </p>
                  {isLinux && (
                    <>
                      <p>
                        The OS keeps a live share open; output is reduced to about 1 fps, with at
                        most one 960 × 540 image sent to your selected vision model every 90
                        seconds. No automatic redaction. Never share confidential content.
                      </p>
                      <p>
                        Requires the desktop timer, an acknowledged local-model connection,
                        advertised vision support, and portal/PipeWire/Python GI/GStreamer
                        dependencies. Dependency checks and the real OS prompt happen when you
                        choose to share—not here.
                      </p>
                      <details className="setup-details">
                        <summary>Ubuntu screen-sharing prerequisites</summary>
                        <p>
                          Review these optional packages for your Ubuntu release. Focus never runs
                          an installer or shell command for you.
                        </p>
                        <pre>
                          sudo apt install python3-gi gir1.2-gstreamer-1.0
                          gir1.2-gst-plugins-base-1.0 gstreamer1.0-pipewire
                          gstreamer1.0-plugins-base gstreamer1.0-plugins-good xdg-desktop-portal
                          xdg-desktop-portal-gnome pipewire
                        </pre>
                      </details>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={screenGuide && screenPrerequisites}
                          disabled={!screenPrerequisites || active}
                          onChange={(e) => setScreenGuide(e.target.checked)}
                        />
                        <span>
                          Show me screen-sharing setup after I begin my first timer. This only opens
                          the controls; it does not grant capture permission.
                        </span>
                      </label>
                      {!screenPrerequisites && (
                        <p>
                          To use that shortcut, enable the desktop timer and connect an installed
                          model first. Vision support is still verified before sharing.
                        </p>
                      )}
                    </>
                  )}
                </Permission>
                <Permission icon={Camera} title="Camera preview" status="Optional foreground test">
                  <p>
                    Not needed for timers or screen suggestions. Video-only preview; no recording,
                    upload, or mood/eye analysis. Your OS may remember a choice, but Focus never
                    starts capture on launch.
                  </p>
                  <CameraCheck onResult={setCameraResult} onActivity={onActivity} />
                </Permission>
                <Permission icon={Keyboard} title="Keyboard & mouse" status="No global access">
                  <p>
                    Only the optional, explicitly started test pad observes coarse input counts.
                    Focus does not request accessibility, input-monitoring, or global keystroke
                    permissions.
                  </p>
                </Permission>
                <Permission
                  icon={Bell}
                  title="Notifications, microphone & startup"
                  status="Not requested"
                >
                  <p>
                    Invitations are inside Focus/the companion, not OS push notifications. No
                    microphone, notification-source access, autostart, contacts, or calendar
                    integration is enabled.
                  </p>
                </Permission>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="setup-ready-mark">
                <CheckCircle2 size={34} />
                <div>
                  <strong>{settings.focusMinutes} minutes for one thing.</strong>
                  <p>
                    A {settings.breakMinutes}-minute break when you choose. No permissions required
                    to begin.
                  </p>
                </div>
              </div>
              <dl className="setup-review">
                <div>
                  <dt>Workspace</dt>
                  <dd>{canSave ? 'Local storage enabled' : 'Temporary / read-only'}</dd>
                </div>
                <div>
                  <dt>Session history</dt>
                  <dd>{settings.keepHistory ? 'Local · 30 days' : 'Off'}</dd>
                </div>
                <div>
                  <dt>Corner timer</dt>
                  <dd>
                    {settings.overlayEnabled
                      ? info.kind === 'web'
                        ? 'On · inside this page only'
                        : c.status.gnomeConnected
                          ? 'On · GNOME connected'
                          : 'On · native fallback'
                      : 'Off · optional'}
                  </dd>
                </div>
                <div>
                  <dt>Break invitations</dt>
                  <dd>
                    {settings.overlayEnabled && settings.gentleReminders
                      ? `Every ${settings.reminderMinutes} active minutes`
                      : settings.gentleReminders
                        ? 'Waiting for corner timer'
                        : 'Off · optional'}
                  </dd>
                </div>
                <div>
                  <dt>Companion</dt>
                  <dd>
                    {modelReady ? `${ai.model} · this launch only` : 'Offline guidance · ready'}
                  </dd>
                </div>
                <div>
                  <dt>Screen context</dt>
                  <dd>
                    {isLinux ? 'Off · choose a source per session' : 'Unavailable on this platform'}
                  </dd>
                </div>
                <div>
                  <dt>Camera</dt>
                  <dd>
                    {cameraResult === 'checked'
                      ? 'Off · preview checked this setup'
                      : cameraResult === 'unavailable'
                        ? 'Off · test unavailable/declined'
                        : 'Off · not tested (optional)'}
                  </dd>
                </div>
              </dl>
              <div className="setup-callout">
                <LockKeyhole size={21} />
                <p>
                  Finishing remembers only this setup milestone and your ordinary preferences—not
                  camera/screen grants, model consent, or test results. You can run setup again from
                  Preferences.
                </p>
              </div>
              {screenGuide && screenPrerequisites && !active && (
                <p className="setup-fine-print">
                  After you start your timer, we’ll open Desktop companion preferences. Choose “Set
                  up screen context…” there if you still want to share.
                </p>
              )}
            </>
          )}
          <div className="setup-actions">
            <Button variant="ghost" onClick={() => finish(false)}>
              {step === 4 ? 'Go to workspace' : 'Skip setup'}
            </Button>
            <div>
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={15} />
                  Back
                </Button>
              )}
              {step < steps.length - 1 ? (
                <Button onClick={next}>
                  Continue
                  <ArrowRight size={15} />
                </Button>
              ) : (
                <Button onClick={() => finish(true)}>
                  <Timer size={16} />
                  {active ? 'Back to my timer' : 'Set my first timer'}
                </Button>
              )}
            </div>
          </div>
          <p className="setup-fine-print setup-dismiss-note">
            Close or press Escape to finish later. Choices made so far stay; no new permission is
            granted by moving between steps.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Permission({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: typeof Monitor;
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <section className="setup-permission">
      <div className="setup-permission-heading">
        <Icon size={19} />
        <h4>{title}</h4>
        <Pill tone="neutral">{status}</Pill>
      </div>
      {children}
    </section>
  );
}
function CameraCheck({
  onResult,
  onActivity,
}: {
  onResult: (result: 'checked' | 'unavailable') => void;
  onActivity: (active: boolean) => void;
}) {
  const [consent, setConsent] = useState(false);
  const camera = useCameraPreview(onActivity);
  useEffect(() => {
    if (camera.state === 'live') onResult('checked');
    else if (camera.error) onResult('unavailable');
  }, [camera.state, camera.error, onResult]);
  return (
    <details
      className="setup-details"
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          camera.stop();
          setConsent(false);
        }
      }}
    >
      <summary>Try camera access (optional)</summary>
      <p>
        This test asks for video only. It stops when you leave this step, hide the app, cancel, or
        use Pause all. Denied access never blocks setup.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked) camera.stop();
          }}
        />
        <span>
          I want to test a live, video-only preview. It stays on this device and is not analyzed.
        </span>
      </label>
      <video
        ref={camera.video}
        autoPlay
        muted
        playsInline
        aria-label="Setup camera preview"
        hidden={camera.state !== 'live'}
      />
      {camera.state === 'off' ? (
        <Button variant="secondary" disabled={!consent} onClick={() => void camera.start()}>
          <Camera size={16} />
          Test camera access
        </Button>
      ) : (
        <Button variant="secondary" onClick={camera.stop}>
          <Square size={14} />
          {camera.state === 'requesting' ? 'Cancel camera request' : 'Stop camera test'}
        </Button>
      )}
      {camera.error && (
        <p className="inline-warning" role="status">
          {camera.error}
        </p>
      )}
      {camera.state === 'live' && (
        <p role="status">Preview is live on this device. Leaving this step turns it off.</p>
      )}
    </details>
  );
}
