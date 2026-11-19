import { useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  FlaskConical,
  Inbox,
  Play,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { evaluateNotice } from '../core/guidance';
import type { RuleDecision, SampleNotice } from '../core/guidance';
import { Button, EmptyState, IconButton, Pill, Toggle } from './ui';

const examples: SampleNotice[] = [
  {
    title: 'A project update',
    body: 'Your teammate has shared a document for your current project.',
    priority: 'normal',
  },
  {
    title: 'A little weekend inspiration',
    body: 'This week’s newsletter and ideas for your reading list.',
    priority: 'low',
  },
  {
    title: 'An urgent source you approved',
    body: 'This example is marked urgent by your explicit source rule, not by words in its message.',
    priority: 'urgent',
  },
];

export default function Notifications({
  task,
  protect,
  onProtect,
}: {
  task: string;
  protect: boolean;
  onProtect: (value: boolean) => void;
}) {
  const [notice, setNotice] = useState<SampleNotice>(examples[0]);
  const [context, setContext] = useState(task);
  const [results, setResults] = useState<
    { id: string; notice: SampleNotice; result: RuleDecision; released: boolean }[]
  >([]);
  const run = () => {
    if (!notice.title.trim()) return;
    const result = evaluateNotice(notice, context, protect);
    setResults((old) =>
      [{ id: crypto.randomUUID(), notice: { ...notice }, result, released: false }, ...old].slice(
        0,
        20,
      ),
    );
  };
  const deferred = results.filter((r) => r.result.action === 'defer' && !r.released).length;
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">QUIETER, WITH CLEAR BOUNDARIES</div>
        <h1>Keep what matters.</h1>
        <p>Explore your rules. Know exactly what’s protected—and what isn’t.</p>
      </div>
      <div className="notice-banner">
        <FlaskConical size={20} />
        <div>
          <strong>Rules sandbox · synthetic examples only</strong>
          <p>
            No applications are connected. This does not intercept or dismiss system notifications.
          </p>
        </div>
        <Pill tone="neutral">0 connected sources</Pill>
      </div>
      <div className="notification-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>A little less noise</h2>
              <p>Deterministic rules. No AI or provider calls.</p>
            </div>
            <ShieldCheck size={22} className="green-text" />
          </div>
          <div className="setting-row inset">
            <div>
              <strong>Focus protection</strong>
              <p>Batch only examples explicitly marked low priority.</p>
            </div>
            <Toggle label="Sandbox focus protection" checked={protect} onChange={onProtect} />
          </div>
          <div className="rule-list">
            <div>
              <Check size={16} />
              <span>Explicit urgent rules always pass through.</span>
            </div>
            <div>
              <Check size={16} />
              <span>Potentially important, uncertain items are allowed.</span>
            </div>
            <div>
              <Check size={16} />
              <span>No guessed mood can hide a notification.</span>
            </div>
          </div>
          <div className="sandbox-form">
            <label className="field-label" htmlFor="sandbox-task">
              Task context
            </label>
            <input
              id="sandbox-task"
              value={context}
              maxLength={160}
              onChange={(e) => setContext(e.target.value)}
              placeholder="What are you working on?"
            />
            <label className="field-label" htmlFor="notice-title">
              Example title
            </label>
            <input
              id="notice-title"
              value={notice.title}
              maxLength={160}
              onChange={(e) => setNotice({ ...notice, title: e.target.value })}
            />
            <label className="field-label" htmlFor="notice-body">
              Example message
            </label>
            <textarea
              id="notice-body"
              rows={3}
              maxLength={500}
              value={notice.body}
              onChange={(e) => setNotice({ ...notice, body: e.target.value })}
            />
            <label className="field-label" htmlFor="notice-priority">
              User-assigned source rule
            </label>
            <select
              id="notice-priority"
              value={notice.priority}
              onChange={(e) =>
                setNotice({ ...notice, priority: e.target.value as SampleNotice['priority'] })
              }
            >
              <option value="normal">Normal · allow if uncertain</option>
              <option value="low">Low priority · batch during focus</option>
              <option value="urgent">Explicit urgent · always allow</option>
            </select>
            <div className="example-shortcuts">
              {examples.map((example, i) => (
                <button type="button" key={example.priority} onClick={() => setNotice(example)}>
                  {['Project update', 'Newsletter', 'Urgent source'][i]}
                </button>
              ))}
            </div>
            <Button onClick={run} disabled={!notice.title.trim()}>
              <Play size={15} />
              Test this example
            </Button>
          </div>
        </section>
        <section className="card sandbox-results">
          <div className="card-heading">
            <div>
              <h2>Your example inbox</h2>
              <p>Volatile examples clear when you leave this page.</p>
            </div>
            <IconButton
              label="Clear sandbox examples"
              onClick={() => setResults([])}
              disabled={!results.length}
            >
              <Trash2 size={17} />
            </IconButton>
          </div>
          {!results.length ? (
            <EmptyState title="No example decisions yet.">
              Run an example to see the rule and the reason behind its path.
            </EmptyState>
          ) : (
            <div className="decision-list" aria-live="polite">
              {results.map(({ id, notice: n, result, released }) => (
                <article className="decision-item" key={id}>
                  <div className="decision-top">
                    <span className="decision-symbol">
                      {result.action === 'allow' || released ? (
                        <Bell size={17} />
                      ) : (
                        <Inbox size={17} />
                      )}
                    </span>
                    <strong>{n.title}</strong>
                    <Pill tone={released || result.action === 'allow' ? 'green' : 'amber'}>
                      {released ? 'Released' : result.action === 'allow' ? 'Allowed' : 'Deferred'}
                    </Pill>
                  </div>
                  <p>{n.body}</p>
                  <div className="decision-reason">
                    <span>{result.rule}</span>
                    <p>{result.reason}</p>
                  </div>
                  <small>SIMULATED · not a real notification</small>
                </article>
              ))}
            </div>
          )}
          {deferred > 0 && (
            <div className="digest-control">
              <span>
                {deferred} deferred {deferred === 1 ? 'example' : 'examples'}
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  setResults((old) =>
                    old.map((r) => ({ ...r, released: r.result.action === 'defer' || r.released })),
                  )
                }
              >
                Release digest
                <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </section>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={17} />
        <p>
          A real integration needs an authorized source and control of delivery before our app
          displays an item. Native observe-after-delivery access is not a universal notification
          firewall.
        </p>
      </div>
    </>
  );
}
