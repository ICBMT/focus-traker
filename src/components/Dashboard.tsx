import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  Coffee,
  Flag,
  Headphones,
  Leaf,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { dayKey, formatDuration, isActive, WORK_STYLES } from '../core/types';
import type {
  Intention,
  Page,
  SessionRecord,
  SessionSnapshot,
  Settings,
  Workspace,
} from '../core/types';
import {
  Botanical,
  Button,
  EmptyState,
  IconButton,
  Pill,
  SectionHeading,
  TextLink,
  TimerDial,
} from './ui';

export function SessionCard({
  session,
  settings,
  busy,
  onStart,
  onPause,
  onResume,
  onFinish,
  onBreak,
  onProtect,
  large = false,
}: {
  session: SessionSnapshot;
  settings: Settings;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onBreak: () => void;
  onProtect: () => void;
  large?: boolean;
}) {
  const active = isActive(session.phase);
  const resting = ['break', 'breakPaused'].includes(session.phase);
  const paused = ['paused', 'breakPaused'].includes(session.phase);
  const readyForBreak = session.phase === 'breakReady';
  const remaining = active ? session.remainingMs : settings.focusMinutes * 60_000;
  const duration = resting ? session.breakDurationMs : session.focusDurationMs;
  const progress = active ? 1 - remaining / duration : 0;
  return (
    <section
      className={`card session-card ${large ? 'session-card-large' : ''}`}
      aria-label="Focus session"
    >
      <div className="card-topline">
        <span className="eyebrow">{resting ? 'A MOMENT TO RESET' : 'YOUR FOCUS SESSION'}</span>
        <button
          className={`protection-badge ${settings.protectFocus ? 'enabled' : ''}`}
          onClick={onProtect}
          type="button"
          aria-pressed={settings.protectFocus}
          title="Controls this app’s discretionary prompts, not other applications"
        >
          <ShieldCheck size={14} />
          {settings.protectFocus ? 'Focus protected' : 'Protection off'}
        </button>
      </div>
      <div className="session-body">
        <div className="session-copy">
          <span className="session-mode">
            <span className="tiny-leaf">
              <Leaf size={13} />
            </span>
            {active ? WORK_STYLES[session.mode].label : 'A fresh start'}
            <span className="small-dot" />
          </span>
          <h2>
            {resting
              ? 'Step away.\nCome back lighter.'
              : active
                ? session.task
                : 'One thing\nat a time.'}
          </h2>
          <p>
            {session.interrupted
              ? 'Paused after a gap or restart. Resume whenever you’re ready.'
              : resting
                ? 'Relax your shoulders. Look beyond the screen. This time is yours.'
                : readyForBreak
                  ? 'You made a little progress. A little rest can come next.'
                  : paused
                    ? 'A little pause is part of the process. Your session is right here.'
                    : active
                      ? 'You’ve made room for this. Let the rest wait a little.'
                      : 'Choose an intention. Find your rhythm.\nWe’ll keep a little space for you.'}
          </p>
          <div className="session-actions">
            {readyForBreak ? (
              <>
                <Button onClick={onBreak} disabled={busy}>
                  <Coffee size={17} />
                  Take a break
                </Button>
                <button
                  className="end-session"
                  aria-label="Done for now"
                  title="Finish without a break"
                  onClick={onFinish}
                  disabled={busy}
                >
                  <Check size={15} />
                </button>
              </>
            ) : active ? (
              <>
                <Button onClick={paused ? onResume : onPause} disabled={busy}>
                  {paused ? (
                    <Play size={17} fill="currentColor" />
                  ) : (
                    <Pause size={17} fill="currentColor" />
                  )}
                  {paused ? 'Resume' : 'Pause'}
                  {resting ? ' break' : ' session'}
                </Button>
                <button
                  className="end-session"
                  aria-label={resting ? 'End break' : 'End session'}
                  title={resting ? 'End break' : 'End session'}
                  onClick={onFinish}
                  disabled={busy}
                >
                  <Square size={14} />
                </button>
              </>
            ) : (
              <>
                <Button onClick={onStart} disabled={busy}>
                  <Play size={16} fill="currentColor" />
                  Start focus
                </Button>
                <button
                  className="duration-button"
                  onClick={onStart}
                  type="button"
                  aria-label="Choose session duration"
                >
                  {settings.focusMinutes} min
                  <ChevronDown size={14} />
                </button>
              </>
            )}
          </div>
        </div>
        <TimerDial
          remainingMs={readyForBreak ? 0 : remaining}
          progress={progress}
          large={large}
          resting={resting}
          label={
            resting
              ? 'A LITTLE ROOM TO BREATHE'
              : readyForBreak
                ? 'A LITTLE PROGRESS MADE'
                : paused
                  ? 'PAUSED, NOT BEHIND'
                  : active
                    ? 'ONE MOMENT AT A TIME'
                    : 'AT YOUR OWN PACE'
          }
        />
      </div>
      <div className="session-footer">
        <span>
          <Headphones size={14} />
          {resting
            ? 'Nothing to prove. This break is yours to end.'
            : active
              ? 'Session time, not a measure of concentration.'
              : 'No pressure. Just a little progress.'}
        </span>
        {active && !resting && !readyForBreak ? (
          <button type="button" onClick={onBreak}>
            Take a break
            <ArrowRight size={13} />
          </button>
        ) : (
          <span className="footer-leaf">
            <Leaf size={14} />
          </span>
        )}
      </div>
    </section>
  );
}

export function CompanionCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="companion-card">
      <div className="companion-tag">
        <Sparkles size={13} />
        YOUR FOCUS COMPANION
      </div>
      <Botanical />
      <div className="companion-copy">
        <h2>
          A little encouragement <br />
          goes a long way.
        </h2>
        <p>
          Untangle a thought. Find a first step. <br />
          You don’t have to do it all at once.
        </p>
        <button className="companion-button" type="button" onClick={onOpen}>
          Let’s talk a little
          <ArrowRight size={17} />
        </button>
      </div>
      <span className="companion-offline">
        <span className="status-dot" />
        Offline guidance available
      </span>
    </section>
  );
}

export function DayStats({ data, session }: { data: Workspace; session: SessionSnapshot }) {
  const today = dayKey(Date.now());
  const records = data.sessions.filter((s) => dayKey(s.startedAt) === today);
  const focus = records.filter((s) => s.kind === 'focus');
  const running =
    ['focus', 'paused'].includes(session.phase) &&
    session.startedAt &&
    dayKey(session.startedAt) === today
      ? session.focusElapsedMs
      : 0;
  const time = focus.reduce((sum, s) => sum + s.durationMs, 0) + running;
  const breaks = records.filter((s) => s.kind === 'break');
  const breakTime = breaks.reduce((sum, s) => sum + s.durationMs, 0);
  const progress = Math.min(1, time / (data.settings.dailyGoalMinutes * 60_000));
  const values = [
    {
      icon: Clock3,
      title: 'Time made for work',
      value: formatDuration(time),
      note: `of your ${formatDuration(data.settings.dailyGoalMinutes * 60_000)} daily intention`,
      tone: 'green',
    },
    {
      icon: Flag,
      title: 'Sessions completed',
      value: String(focus.filter((s) => s.completed).length).padStart(2, '0'),
      note: focus.length
        ? `${focus.length} work ${focus.length === 1 ? 'session' : 'sessions'} recorded today`
        : 'Your next small beginning is waiting',
      tone: 'peach',
    },
    {
      icon: Coffee,
      title: 'Time to recharge',
      value: formatDuration(breakTime),
      note: breaks.length
        ? `${breaks.length} ${breaks.length === 1 ? 'pause' : 'pauses'} made for yourself`
        : 'Rest is part of good work',
      tone: 'lavender',
    },
  ];
  return (
    <div className="stats-grid">
      {values.map((item, index) => (
        <div className="stat-card" key={item.title}>
          <div className={`stat-icon ${item.tone}`}>
            <item.icon size={20} strokeWidth={1.6} />
          </div>
          <div className="stat-content">
            <span className="stat-label">{item.title}</span>
            <div className="stat-value">
              {item.value}
              {index === 0 && (
                <span className="mini-progress">
                  <i style={{ width: `${progress * 100}%` }} />
                </span>
              )}
            </div>
            <span className="stat-note">{item.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function IntentionsCard({
  intentions,
  onAdd,
  onToggle,
  onStart,
  onDelete,
}: {
  intentions: Intention[];
  onAdd: () => void;
  onToggle: (id: string) => void;
  onStart: (title: string, mode: Intention['mode']) => void;
  onDelete: (id: string) => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const filtered = intentions.filter((i) => showCompleted || !i.completed);
  const visible = filtered.slice(0, showAll ? 100 : 5);
  const completed = intentions.filter((i) => i.completed).length;
  return (
    <section className="card intentions-card">
      <div className="card-heading">
        <div>
          <h2>
            Today’s intentions{' '}
            <span className="count-badge">{intentions.filter((i) => !i.completed).length}</span>
          </h2>
          <p>A little direction for your attention.</p>
        </div>
        <IconButton label="Add intention" onClick={onAdd}>
          <Plus size={19} />
        </IconButton>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          compact
          title={intentions.length ? 'A little progress, made.' : 'A clear list. A fresh start.'}
          action={
            <button className="add-inline" onClick={onAdd}>
              <Plus size={14} />
              {intentions.length ? 'Add another intention' : 'Add your first intention'}
            </button>
          }
        >
          {intentions.length
            ? 'You’ve checked off your intentions. Make room for a pause, too.'
            : 'What’s one thing you’d like to move forward?'}
        </EmptyState>
      ) : (
        <div className="intention-list">
          {visible.map((item) => (
            <div className={`intention-row ${item.completed ? 'completed' : ''}`} key={item.id}>
              <button
                className="intention-check"
                onClick={() => onToggle(item.id)}
                aria-label={`${item.completed ? 'Uncomplete' : 'Complete'} ${item.title}`}
                aria-pressed={item.completed}
              >
                {item.completed && <Check size={13} />}
              </button>
              <div className="intention-text">
                <span>{item.title}</span>
                <small>{WORK_STYLES[item.mode].label}</small>
              </div>
              <button
                className="row-start"
                onClick={() => onStart(item.title, item.mode)}
                aria-label={`Focus on ${item.title}`}
              >
                <Play size={14} />
              </button>
              <button
                className="row-delete"
                onClick={() => onDelete(item.id)}
                aria-label={`Delete ${item.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="add-inline intention-add" onClick={onAdd}>
            <Plus size={14} />
            Add an intention
          </button>
        </div>
      )}
      <div className="card-bottom intention-bottom">
        <span>
          {completed
            ? `${completed} ${completed === 1 ? 'intention' : 'intentions'} completed`
            : 'One small step is a good place to start.'}
        </span>
        {filtered.length > 5 && (
          <button type="button" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `View all ${filtered.length}`}
          </button>
        )}
        {completed > 0 && (
          <button type="button" onClick={() => setShowCompleted(!showCompleted)}>
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
        )}
      </div>
    </section>
  );
}

export function WeekChart({
  sessions,
  extended = false,
}: {
  sessions: SessionRecord[];
  extended?: boolean;
}) {
  const today = dayKey(Date.now());
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        const total = sessions
          .filter((s) => s.kind === 'focus' && dayKey(s.startedAt) === dayKey(date))
          .reduce((sum, s) => sum + s.durationMs, 0);
        return {
          date,
          total,
          label: date.toLocaleDateString(undefined, { weekday: 'short' }),
          today: index === 6,
        };
      }),
    [sessions, today],
  );
  const max = Math.max(60 * 60_000, ...days.map((day) => day.total));
  const hasData = days.some((day) => day.total > 0);
  return (
    <div
      className={`week-chart ${extended ? 'extended' : ''}`}
      role="img"
      aria-label={`Work-session time over the last seven days: ${days.map((day) => `${day.label} ${formatDuration(day.total)}`).join(', ')}. Session time is not verified concentration.`}
    >
      <div className="chart-plot">
        <div className="chart-grid">
          <span />
          <span />
          <span />
        </div>
        {!hasData && (
          <div className="chart-empty">
            <TrendingUp size={18} />
            <span>
              Your rhythm begins
              <br />
              with one session.
            </span>
          </div>
        )}
        <div className="chart-columns">
          {days.map((day) => (
            <div
              className={`chart-column ${day.today ? 'today' : ''}`}
              key={day.label}
              title={`${day.date.toLocaleDateString()}: ${formatDuration(day.total)} session time`}
            >
              <div className="chart-bar-track">
                <div
                  className={`chart-bar ${day.total ? 'has-value' : ''}`}
                  style={{ height: day.total ? `${Math.max(4, (day.total / max) * 100)}%` : '3px' }}
                />
              </div>
              <span>{day.label}</span>
              {day.today && <i />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Overview({
  data,
  session,
  busy,
  onStart,
  onAdd,
  onPause,
  onResume,
  onFinish,
  onBreak,
  onProtect,
  onOpenCoach,
  onNavigate,
  onToggle,
  onDelete,
}: {
  data: Workspace;
  session: SessionSnapshot;
  busy: boolean;
  onStart: (title?: string, mode?: Intention['mode']) => void;
  onAdd: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onBreak: () => void;
  onProtect: () => void;
  onOpenCoach: () => void;
  onNavigate: (page: Page) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="welcome">
        <div>
          <div className="eyebrow welcome-eyebrow">
            <span className="small-sun" />A LITTLE MORE PRESENT
          </div>
          <h1>
            Make space for good work<span>.</span>
          </h1>
          <p>Your attention is a good place to begin.</p>
        </div>
        <div className="today-date">
          <span>{new Date().toLocaleDateString(undefined, { weekday: 'long' })}</span>
          <strong>
            {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </strong>
        </div>
      </div>
      <div className="overview-hero">
        <SessionCard
          session={session}
          settings={data.settings}
          busy={busy}
          onStart={() => onStart()}
          onPause={onPause}
          onResume={onResume}
          onFinish={onFinish}
          onBreak={onBreak}
          onProtect={onProtect}
        />
        <CompanionCard onOpen={onOpenCoach} />
      </div>
      <SectionHeading
        title="Your day, at a glance"
        description="Small steps add up. There’s no score to chase."
        action={
          <button className="period-pill" onClick={() => onNavigate('insights')}>
            Today
            <ChevronDown size={13} />
          </button>
        }
      />
      <DayStats data={data} session={session} />
      <div className="overview-bottom">
        <IntentionsCard
          intentions={data.intentions}
          onAdd={onAdd}
          onToggle={onToggle}
          onStart={onStart}
          onDelete={onDelete}
        />
        <section className="card rhythm-card">
          <div className="card-heading">
            <div>
              <h2>A rhythm of your own</h2>
              <p>The space you’ve made over the last seven days.</p>
            </div>
            <IconButton label="View session insights" onClick={() => onNavigate('insights')}>
              <MoreHorizontal size={19} />
            </IconButton>
          </div>
          <WeekChart sessions={data.sessions} />
          <div className="card-bottom">
            <span>
              <span className="legend-dot" />
              Work-session time
            </span>
            <TextLink onClick={() => onNavigate('insights')}>View insights</TextLink>
          </div>
        </section>
      </div>
      <div className="workspace-note">
        <span>
          <ShieldCheck size={14} />
          Your pace. Your space. Your data stays with you.
        </span>
        <button type="button" onClick={() => onNavigate('settings')}>
          Privacy & preferences
          <ArrowRight size={13} />
        </button>
      </div>
    </>
  );
}

export function Insights({
  data,
  session,
  onStart,
  onExport,
  onCheckIn,
}: {
  data: Workspace;
  session: SessionSnapshot;
  onStart: () => void;
  onExport: () => void;
  onCheckIn: (id: string) => void;
}) {
  const [kind, setKind] = useState<'all' | 'focus' | 'break'>('all');
  const records = [...data.sessions]
    .reverse()
    .filter((record) => kind === 'all' || record.kind === kind);
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">REFLECTION, NOT A REPORT CARD</div>
        <h1>A rhythm of your own.</h1>
        <p>A little perspective on the time you’ve chosen to make.</p>
      </div>
      <DayStats data={data} session={session} />
      <section className="card insights-chart">
        <div className="card-heading">
          <div>
            <h2>Your last seven days</h2>
            <p>Session time is not verified concentration or productivity.</p>
          </div>
          <Pill tone="neutral">Local history · 30 days</Pill>
        </div>
        <WeekChart sessions={data.sessions} extended />
      </section>
      <section className="card history-card">
        <div className="card-heading">
          <div>
            <h2>The little steps you’ve taken</h2>
            <p>Optional check-ins are your words, never sensor guesses.</p>
          </div>
          <Button variant="secondary" onClick={onExport}>
            <ArrowDownToLine size={15} />
            Export
          </Button>
        </div>
        <div className="tabs" aria-label="Filter session history">
          {(['all', 'focus', 'break'] as const).map((tab) => (
            <button
              key={tab}
              className={kind === tab ? 'active' : ''}
              onClick={() => setKind(tab)}
              aria-pressed={kind === tab}
            >
              {tab === 'all' ? 'All sessions' : tab === 'focus' ? 'Work sessions' : 'Breaks'}
            </button>
          ))}
        </div>
        {!records.length ? (
          <EmptyState
            title="Your story starts with a small step."
            action={
              <Button onClick={onStart}>
                <Play size={15} />
                Start a session
              </Button>
            }
          >
            Finished sessions will appear here. No camera, AI, or permissions needed.
          </EmptyState>
        ) : (
          <div className="history-list">
            {records.map((record) => (
              <div className="history-row" key={record.id}>
                <span className={`history-icon ${record.kind}`}>
                  {record.kind === 'focus' ? <BookOpen size={18} /> : <Coffee size={18} />}
                </span>
                <div className="history-title">
                  <strong>{record.task}</strong>
                  <span>
                    {new Date(record.startedAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    · {record.kind === 'focus' ? WORK_STYLES[record.mode].label : 'A little rest'}
                  </span>
                </div>
                <Pill tone={record.completed ? 'green' : 'neutral'}>
                  {record.completed ? 'Completed' : 'Ended early'}
                </Pill>
                <strong className="history-duration">{formatDuration(record.durationMs)}</strong>
                {record.kind === 'focus' && (
                  <button className="checkin-link" onClick={() => onCheckIn(record.id)}>
                    {record.checkIn
                      ? {
                          inTheZone: 'In the zone',
                          steady: 'Steady',
                          stuck: 'Stuck',
                          tired: 'Tired',
                        }[record.checkIn]
                      : 'Check in'}
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function QuietCard({
  protectedFocus,
  onNavigate,
}: {
  protectedFocus: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="quiet-note">
      <span className="quiet-icon">
        <ShieldCheck size={21} />
      </span>
      <div>
        <strong>
          {protectedFocus ? 'A quieter space, by choice.' : 'Your space, your preferences.'}
        </strong>
        <p>
          Focus protection manages this app’s prompts—not other applications. No notification
          sources are connected.
        </p>
      </div>
      <button onClick={onNavigate}>
        See coverage
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

// Exported separately so empty states never need fabricated sessions or statistics.
export const modeIcons = { deep: Target, reading: BookOpen, creative: Sparkles };
