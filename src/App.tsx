import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Coffee,
  Compass,
  Eye,
  Flower2,
  Heart,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  X,
} from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import { runtime } from './lib/runtime';
import { emptyAiConnection } from './core/ai';
import type { AiConnection } from './core/ai';
import { isActive, WORK_STYLES } from './core/types';
import type { CheckIn, Intention, Page, WorkStyle } from './core/types';
import { Insights, Overview, QuietCard, SessionCard } from './components/Dashboard';
import Sensors from './components/Sensors';
import Notifications from './components/Notifications';
import Preferences from './components/Settings';
import Coach from './components/Coach';
import RestGarden from './components/RestGarden';
import { Button, IconButton, Modal } from './components/ui';

type Dialog = 'start' | 'intention' | 'break' | 'finish' | 'search' | 'checkIn' | null;
type SettingsTab = 'general' | 'ai' | 'privacy' | 'about';
const pages = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'workspace' },
  { id: 'room', label: 'Focus room', icon: Timer, group: 'workspace' },
  { id: 'insights', label: 'Your insights', icon: Activity, group: 'workspace' },
  { id: 'sensors', label: 'Your sensors', icon: Compass, group: 'space', lab: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'space', lab: true },
  { id: 'settings', label: 'Preferences', icon: Settings2, group: 'space' },
] as const;

export default function App() {
  const app = useWorkspace();
  const [page, setPage] = useState<Page>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(true);
  const [coach, setCoach] = useState(false);
  const [garden, setGarden] = useState(false);
  const [ai, setAi] = useState<AiConnection>(emptyAiConnection);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMode, setDraftMode] = useState<WorkStyle>('deep');
  const [draftMinutes, setDraftMinutes] = useState('25');
  const [formError, setFormError] = useState('');
  const [breakMs, setBreakMs] = useState(5 * 60_000);
  const [search, setSearch] = useState('');
  const [checkInId, setCheckInId] = useState('');
  const [sensorsActive, setSensorsActive] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    action?: { label: string; run: () => void };
  } | null>(null);
  const main = useRef<HTMLElement>(null);
  const notify = useCallback(
    (message: string, action?: { label: string; run: () => void }) => setToast({ message, action }),
    [],
  );
  const onSensorsActivity = useCallback((active: boolean) => setSensorsActive(active), []);
  const navigate = useCallback((next: Page, section: SettingsTab = 'general') => {
    setPage(next);
    setSettingsTab(section);
    setMobileNav(false);
    main.current?.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        app.data.settings.theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : app.data.settings.theme;
      document.documentElement.dataset.reduceMotion = String(app.data.settings.reduceMotion);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [app.data.settings.theme, app.data.settings.reduceMotion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !coach &&
        !garden &&
        !dialog &&
        !app.recovery
      ) {
        event.preventDefault();
        setSearch('');
        setDialog('search');
      }
      if (event.key === 'Escape') setMobileNav(false);
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [coach, garden, dialog, app.recovery]);

  const openStart = (title = '', mode: WorkStyle = 'deep') => {
    if (app.recovery) {
      setRecoveryVisible(true);
      return;
    }
    if (isActive(app.session.phase)) {
      navigate('room');
      notify('Your current session is right here. Finish it before starting another.');
      return;
    }
    setDraftTitle(title);
    setDraftMode(mode);
    setDraftMinutes(String(app.data.settings.focusMinutes));
    setFormError('');
    setDialog('start');
  };
  const openAdd = () => {
    setDraftTitle('');
    setDraftMode('deep');
    setFormError('');
    setDialog('intention');
  };
  const openBreak = () => {
    if (app.recovery) {
      setRecoveryVisible(true);
      return;
    }
    setBreakMs(app.data.settings.breakMinutes * 60_000);
    setDialog('break');
  };
  const finish = () => {
    if (['break', 'breakPaused'].includes(app.session.phase)) {
      void app.run(() => runtime.finish()).then(() => notify('A little rest, made. Welcome back.'));
    } else setDialog('finish');
  };
  const toggleIntention = (id: string) =>
    app.setData((old) => ({
      ...old,
      intentions: old.intentions.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    }));
  const deleteIntention = (id: string) => {
    const removed = app.data.intentions.find((item) => item.id === id);
    app.setData((old) => ({ ...old, intentions: old.intentions.filter((item) => item.id !== id) }));
    if (removed)
      notify('Intention removed. A little more room.', {
        label: 'Undo',
        run: () => {
          app.setData((old) => ({
            ...old,
            intentions:
              old.intentions.length < 100 && !old.intentions.some((item) => item.id === id)
                ? [...old.intentions, removed]
                : old.intentions,
          }));
          setToast(null);
        },
      });
  };
  const protect = () => app.updateSettings({ protectFocus: !app.data.settings.protectFocus });
  const exportData = async () => {
    try {
      const result = await runtime.export(app.data);
      if (result) notify(result);
    } catch {
      notify('The export could not be completed. No data was sent anywhere.');
    }
  };
  const pauseAll = async () => {
    await app.pauseAll();
    notify(
      'Session paused. Sensor tests stopped and model requests cancelled. Resume each feature only when you choose.',
    );
  };
  const changeAi = (patch: Partial<AiConnection>) => setAi((old) => ({ ...old, ...patch }));
  const sourceTitle = pages.find((p) => p.id === page)?.label ?? 'Overview';

  return (
    <div className={`app-shell ${mobileNav ? 'nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className="sidebar" id="workspace-navigation">
        <button
          className="brand"
          type="button"
          aria-label="Focus home"
          onClick={() => navigate('overview')}
        >
          <img src="/icon.svg" width="37" height="37" alt="" />
          <span>
            focus<span className="brand-period">.</span>
            <small>A LITTLE MORE PRESENT</small>
          </span>
        </button>
        <div className="workspace-selector">
          <span className="workspace-symbol">
            <Leaf size={15} />
          </span>
          <div>
            <strong>My workspace</strong>
            <span>Personal & local</span>
          </div>
          <LockKeyhole size={13} />
        </div>
        <nav aria-label="Main navigation">
          {(['workspace', 'space'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-label">
                {group === 'workspace' ? 'WORKSPACE' : 'YOUR SPACE'}
              </span>
              {pages
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    aria-label={item.label}
                    className={`nav-item ${page === item.id ? 'active' : ''}`}
                    aria-current={page === item.id ? 'page' : undefined}
                  >
                    <item.icon size={18} strokeWidth={1.65} />
                    <span>{item.label}</span>
                    {'lab' in item && item.lab ? (
                      <span className="nav-lab">Lab</span>
                    ) : page === item.id ? (
                      <span className="nav-active-dot" />
                    ) : null}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-invitation">
            <span className="sidebar-sparkle">
              <Sparkles size={19} />
            </span>
            <p>
              A little stuck?
              <br />
              <strong>Start with a small thought.</strong>
            </p>
            <button
              onClick={() => {
                setMobileNav(false);
                setCoach(true);
              }}
            >
              Meet your companion
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="sidebar-privacy" onClick={() => navigate('settings', 'privacy')}>
            <span>
              <ShieldCheck size={16} />
            </span>
            <div>
              <strong>Local first. Always yours.</strong>
              <small>No account. No tracking.</small>
            </div>
          </button>
          <div className="sidebar-version">
            <span>FOCUS TRACKER</span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Toggle navigation"
              aria-expanded={mobileNav}
              aria-controls="workspace-navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={21} />
            </button>
            <Leaf size={16} strokeWidth={1.5} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{sourceTitle}</strong>
          </div>
          <div className="topbar-tools">
            <button
              className="search-button"
              onClick={() => {
                setSearch('');
                setDialog('search');
              }}
              aria-label="Search intentions"
            >
              <Search size={17} />
              <span>Search</span>
              <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
            </button>
            <span className="topbar-divider" />
            <span
              className={`runtime-badge ${app.info.kind}`}
              title={
                app.info.kind === 'web'
                  ? 'Real timer and local browser data. No native/global access.'
                  : 'Native Rust session engine. Sensor capabilities remain separate.'
              }
            >
              {app.info.kind === 'web' ? 'Web preview' : 'Desktop · Rust'}
            </span>
            <IconButton
              label="Pause session and all sensor tests"
              onClick={() => void pauseAll()}
              disabled={app.busy}
            >
              <Pause size={17} />
            </IconButton>
            <IconButton label="Notification coverage" onClick={() => navigate('notifications')}>
              <Bell size={18} />
            </IconButton>
            <button
              className="profile-button"
              aria-label="Your preferences"
              title="Your personal workspace"
              onClick={() => navigate('settings')}
            >
              <Flower2 size={21} strokeWidth={1.7} />
            </button>
          </div>
        </header>
        <main ref={main} id="main-content" className={`main-content page-${page}`} tabIndex={-1}>
          {app.error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={18} />
              <span>{app.error}</span>
              <IconButton label="Dismiss message" onClick={() => app.setError('')}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {app.ready && app.recovery && !recoveryVisible && (
            <div className="recovery-banner">
              <Pause size={18} />
              <span>A previous session is waiting. Nothing resumed automatically.</span>
              <Button variant="secondary" onClick={() => setRecoveryVisible(true)}>
                Review checkpoint
              </Button>
            </div>
          )}
          {!app.ready ? (
            <div className="loading-state">
              <LoaderCircle className="spinner-icon" size={28} />
              <h1>Making a little room…</h1>
            </div>
          ) : (
            <>
              {page === 'overview' && (
                <Overview
                  data={app.data}
                  session={app.session}
                  busy={app.busy}
                  onStart={openStart}
                  onAdd={openAdd}
                  onPause={() => void app.run(() => runtime.pause())}
                  onResume={() => void app.run(() => runtime.resume())}
                  onFinish={finish}
                  onBreak={openBreak}
                  onProtect={protect}
                  onOpenCoach={() => setCoach(true)}
                  onNavigate={navigate}
                  onToggle={toggleIntention}
                  onDelete={deleteIntention}
                />
              )}
              {page === 'room' && (
                <>
                  <div className="page-intro focus-room-intro">
                    <div>
                      <div className="eyebrow">MAKE A LITTLE ROOM</div>
                      <h1>Just you and the next step.</h1>
                      <p>One intention is enough for right now.</p>
                    </div>
                    <button className="text-link" onClick={() => navigate('overview')}>
                      <ArrowLeft size={15} />
                      Back to overview
                    </button>
                  </div>
                  <SessionCard
                    session={app.session}
                    settings={app.data.settings}
                    busy={app.busy}
                    onStart={() => openStart()}
                    onPause={() => void app.run(() => runtime.pause())}
                    onResume={() => void app.run(() => runtime.resume())}
                    onFinish={finish}
                    onBreak={openBreak}
                    onProtect={protect}
                    large
                  />
                  <div className="room-bottom">
                    <button onClick={() => setCoach(true)}>
                      <MessageCircle size={16} />A little encouragement
                    </button>
                    <button onClick={openBreak}>
                      <Coffee size={17} />
                      Make room for rest
                    </button>
                    {['break', 'breakPaused'].includes(app.session.phase) && (
                      <button onClick={() => setGarden(true)}>
                        <Flower2 size={17} />A tiny garden game
                      </button>
                    )}
                    <span>
                      <ShieldCheck size={14} />
                      {sensorsActive
                        ? 'A deliberate sensor test is active'
                        : 'No sensor tests active'}
                    </span>
                  </div>
                  <QuietCard
                    protectedFocus={app.data.settings.protectFocus}
                    onNavigate={() => navigate('notifications')}
                  />
                </>
              )}
              {page === 'insights' && (
                <Insights
                  data={app.data}
                  session={app.session}
                  onStart={() => openStart()}
                  onExport={() => void exportData()}
                  onCheckIn={(id) => {
                    setCheckInId(id);
                    setDialog('checkIn');
                  }}
                />
              )}
              {page === 'sensors' && (
                <Sensors info={app.info} onActivity={onSensorsActivity} onNotice={notify} />
              )}
              {page === 'notifications' && (
                <Notifications
                  task={app.session.task}
                  protect={app.data.settings.protectFocus}
                  onProtect={(protectFocus) => app.updateSettings({ protectFocus })}
                />
              )}
              {page === 'settings' && (
                <Preferences
                  key={settingsTab}
                  initialTab={settingsTab}
                  settings={app.data.settings}
                  info={app.info}
                  canSave={app.canSave}
                  ai={ai}
                  onAiChange={changeAi}
                  onUpdate={app.updateSettings}
                  onExport={() => void exportData()}
                  onClear={async (all) => {
                    setToast(null);
                    const cleared = await app.clearData(all);
                    if (all && cleared) setAi(emptyAiConnection());
                    if (cleared)
                      notify(
                        all
                          ? 'A fresh start. Your local workspace has been reset.'
                          : 'Session history cleared. Your intentions and preferences are still here.',
                      );
                    return cleared;
                  }}
                  onNotice={notify}
                />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            <span className={`status-dot ${sensorsActive ? 'active' : 'inactive'}`} />
            {sensorsActive
              ? 'Local sensor experiment active'
              : 'Sensors off. Your space is private.'}
          </span>
          <button onClick={() => navigate('settings', 'about')}>
            <Heart size={12} />
            Made for a little more balance
          </button>
        </footer>
      </div>
      {dialog && (
        <Modal
          title={
            dialog === 'start'
              ? 'Make room for one thing.'
              : dialog === 'intention'
                ? 'What matters next?'
                : dialog === 'break'
                  ? 'A little space to recharge.'
                  : dialog === 'finish'
                    ? 'Call this a little progress?'
                    : dialog === 'search'
                      ? 'Find a little direction.'
                      : 'How did that feel?'
          }
          eyebrow={
            dialog === 'start'
              ? 'YOUR NEXT FOCUS SESSION'
              : dialog === 'intention'
                ? 'A SMALL INTENTION'
                : dialog === 'break'
                  ? 'REST IS PART OF THE PROCESS'
                  : dialog === 'search'
                    ? 'YOUR INTENTIONS'
                    : dialog === 'checkIn'
                      ? 'YOUR WORDS, NOT A SENSOR SCORE'
                      : 'FINISH SESSION'
          }
          onClose={() => setDialog(null)}
        >
          {(dialog === 'start' || dialog === 'intention') && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setFormError('');
                const title = draftTitle.trim();
                if (!title || title.length > 160) {
                  setFormError('Give your intention a short name, up to 160 characters.');
                  return;
                }
                if (dialog === 'intention') {
                  if (app.data.intentions.length >= 100) {
                    setFormError('Your list is full. Remove an intention before adding another.');
                    return;
                  }
                  const intention: Intention = {
                    id: crypto.randomUUID(),
                    title,
                    mode: draftMode,
                    completed: false,
                    createdAt: Date.now(),
                  };
                  app.setData((old) => ({ ...old, intentions: [...old.intentions, intention] }));
                  setDialog(null);
                  notify('A little direction, added to your day.');
                } else {
                  const minutes = Number(draftMinutes);
                  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
                    setFormError('Choose between 1 and 180 whole minutes.');
                    return;
                  }
                  const result = await app.start({
                    id: crypto.randomUUID(),
                    task: title,
                    mode: draftMode,
                    durationMs: minutes * 60_000,
                  });
                  if (result) {
                    setDialog(null);
                    notify('Your session has begun. One small step at a time.');
                  }
                }
              }}
            >
              <p className="modal-description">
                {dialog === 'start'
                  ? 'Choose a small, meaningful outcome. No camera, AI, or input permissions needed.'
                  : 'Turn a big goal into a small, approachable next step.'}
              </p>
              <label className="field-label" htmlFor="intention-title">
                Your intention
              </label>
              <input
                id="intention-title"
                data-autofocus
                value={draftTitle}
                maxLength={160}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="e.g. Write the first draft of my proposal"
                required
                autoComplete="off"
              />
              {dialog === 'start' && app.data.intentions.some((item) => !item.completed) && (
                <div className="intention-chips">
                  {app.data.intentions
                    .filter((item) => !item.completed)
                    .slice(0, 3)
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setDraftTitle(item.title);
                          setDraftMode(item.mode);
                        }}
                      >
                        {item.title}
                      </button>
                    ))}
                </div>
              )}
              <label className="field-label">What kind of space do you need?</label>
              <div className="mode-picker">
                {(
                  [
                    { value: 'deep', icon: Target },
                    { value: 'reading', icon: BookOpen },
                    { value: 'creative', icon: Sparkles },
                  ] as const
                ).map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    aria-pressed={draftMode === item.value}
                    className={draftMode === item.value ? 'selected' : ''}
                    onClick={() => setDraftMode(item.value)}
                  >
                    <item.icon size={20} />
                    <span>{WORK_STYLES[item.value].label}</span>
                  </button>
                ))}
              </div>
              {dialog === 'start' && (
                <>
                  <label className="field-label" htmlFor="session-duration">
                    How much room?
                  </label>
                  <div className="duration-picker">
                    {[25, 50, 90].map((minutes) => (
                      <button
                        type="button"
                        key={minutes}
                        className={Number(draftMinutes) === minutes ? 'selected' : ''}
                        aria-pressed={Number(draftMinutes) === minutes}
                        onClick={() => setDraftMinutes(String(minutes))}
                      >
                        {minutes} <span>min</span>
                      </button>
                    ))}
                    <div className="custom-duration">
                      <input
                        id="session-duration"
                        aria-label="Session duration in minutes"
                        type="number"
                        min={1}
                        max={180}
                        step={1}
                        value={draftMinutes}
                        onChange={(event) => setDraftMinutes(event.target.value)}
                        required
                      />
                      <span>min</span>
                    </div>
                  </div>
                  <div className="modal-privacy">
                    <ShieldCheck size={14} />
                    Your timer works even when every sensor is off.
                  </div>
                </>
              )}
              {formError && (
                <p className="field-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="modal-actions">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Not now
                </Button>
                <Button type="submit" disabled={app.busy}>
                  {dialog === 'start' ? <Play size={15} fill="currentColor" /> : <Plus size={16} />}
                  {app.busy ? 'Starting…' : dialog === 'start' ? 'Begin session' : 'Add intention'}
                </Button>
              </div>
            </form>
          )}
          {dialog === 'break' && (
            <>
              <p className="modal-description">
                A break is a choice, not something you need to earn. Sensor tests stop when it
                begins. You can pause or end it at any time.
              </p>
              <div className="break-options">
                {[
                  {
                    ms: 20_000,
                    icon: Eye,
                    title: 'Look a little further',
                    text: '20 seconds · look away from the screen',
                  },
                  {
                    ms: app.data.settings.breakMinutes * 60_000,
                    icon: Coffee,
                    title: 'A proper little pause',
                    text: `${app.data.settings.breakMinutes} minutes · move, stretch, or get water`,
                  },
                  {
                    ms: (app.data.settings.breakMinutes === 10 ? 15 : 10) * 60_000,
                    icon: Leaf,
                    title: 'A screen-free reset',
                    text: `${app.data.settings.breakMinutes === 10 ? 15 : 10} minutes · take a little walk or stretch`,
                  },
                ].map((option) => (
                  <button
                    key={option.title}
                    type="button"
                    aria-pressed={breakMs === option.ms}
                    className={breakMs === option.ms ? 'selected' : ''}
                    onClick={() => setBreakMs(option.ms)}
                  >
                    <option.icon size={23} />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.text}</small>
                    </span>
                    <span className="radio-check">
                      {breakMs === option.ms && <Check size={13} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="modal-privacy">
                <LockKeyhole size={14} />
                No system lock, mandatory game, or “prove you rested” check.
              </div>
              <div className="modal-actions">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Keep working
                </Button>
                <Button
                  disabled={app.busy}
                  onClick={async () => {
                    window.dispatchEvent(new Event('focus:pause-sensors'));
                    await runtime.stopChat().catch(() => {});
                    const result = await app.run(() =>
                      runtime.startBreak(crypto.randomUUID(), breakMs),
                    );
                    if (result) {
                      setDialog(null);
                      navigate('room');
                      notify(
                        'A little space for yourself. You can end this break whenever you need.',
                      );
                    }
                  }}
                >
                  <Coffee size={16} />
                  Begin break
                </Button>
              </div>
            </>
          )}
          {dialog === 'finish' && (
            <>
              <p className="modal-description">
                Your elapsed session time will be recorded if history is enabled. Ending early is
                okay—this is your pace, not a test.
              </p>
              <div className="finish-intention">
                <Leaf size={21} />
                <strong>{app.session.task}</strong>
              </div>
              <div className="modal-actions">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Keep my session
                </Button>
                <Button
                  onClick={async () => {
                    const result = await app.run(() => runtime.finish());
                    if (result) {
                      setDialog(null);
                      notify('A little progress, made. You can reflect in Your insights.');
                    }
                  }}
                  disabled={app.busy}
                >
                  <Check size={16} />
                  Finish session
                </Button>
              </div>
            </>
          )}
          {dialog === 'search' && (
            <>
              <div className="search-field">
                <Search size={18} />
                <input
                  data-autofocus
                  aria-label="Search your intentions"
                  placeholder="Search your intentions…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="search-results">
                {app.data.intentions
                  .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
                  .slice(0, 10)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setDialog(null);
                        openStart(item.title, item.mode);
                      }}
                    >
                      <span className={`intention-check ${item.completed ? 'is-complete' : ''}`}>
                        {item.completed ? <Check size={12} /> : <Leaf size={12} />}
                      </span>
                      <span>
                        {item.title}
                        <small>{WORK_STYLES[item.mode].label}</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                {!app.data.intentions.filter((item) =>
                  item.title.toLowerCase().includes(search.toLowerCase()),
                ).length && (
                  <div className="search-empty">
                    <Search size={25} />
                    <p>
                      {search
                        ? 'No matching intentions. A new direction?'
                        : 'Your intentions will appear here.'}
                    </p>
                    <button className="text-link" onClick={openAdd}>
                      <Plus size={14} />
                      Add an intention
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {dialog === 'checkIn' && (
            <>
              <p className="modal-description">
                Only if you feel like sharing with your own local history. This never trains a
                remote model or changes your access.
              </p>
              <div className="checkin-options">
                {(
                  [
                    { value: 'inTheZone', label: 'In the zone', icon: Sparkles },
                    { value: 'steady', label: 'Steady enough', icon: Leaf },
                    { value: 'stuck', label: 'A little stuck', icon: Compass },
                    { value: 'tired', label: 'Ready for rest', icon: Coffee },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      app.setData((old) => ({
                        ...old,
                        sessions: old.sessions.map((record) =>
                          record.id === checkInId
                            ? { ...record, checkIn: option.value as CheckIn }
                            : record,
                        ),
                      }));
                      setDialog(null);
                      notify('Your check-in is saved locally. There’s no right answer.');
                    }}
                  >
                    <option.icon size={22} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              <div className="modal-actions">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  Skip this check-in
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
      {app.ready && app.recovery && recoveryVisible && (
        <Modal
          title="Pick up where you left off?"
          eyebrow="A SESSION WAS INTERRUPTED"
          onClose={() => setRecoveryVisible(false)}
        >
          <p className="modal-description">
            “{app.recovery.task}” was interrupted. No timer, camera, input test, or enforcement
            restarted automatically. Recovering it leaves the timer paused until you choose Resume.
          </p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={app.discardRecovery}>
              Discard checkpoint
            </Button>
            <Button onClick={() => void app.recover()} disabled={app.busy}>
              <Pause size={16} />
              Recover paused session
            </Button>
          </div>
        </Modal>
      )}
      {coach && (
        <Coach
          ai={ai}
          task={app.session.task}
          onClose={() => setCoach(false)}
          onSettings={() => {
            setCoach(false);
            navigate('settings', 'ai');
          }}
        />
      )}
      {garden && <RestGarden onClose={() => setGarden(false)} />}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={16} />
          </span>
          <p>{toast.message}</p>
          {toast.action && (
            <button className="toast-action" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
