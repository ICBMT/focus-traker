import { Coffee, Flower2, Leaf, MessageCircle, Play } from 'lucide-react';
import type { ScreenAdvice } from '../core/companion';
import type { SessionSnapshot } from '../core/types';
import { formatTimer } from '../core/types';
import { Button, Modal, Pill } from './ui';

export default function RestSpace({
  session,
  message,
  minutes,
  busy,
  onClose,
  onBreak,
  onResume,
  onGarden,
  onTalk,
}: {
  session: SessionSnapshot;
  message: ScreenAdvice | null;
  minutes: number;
  busy: boolean;
  onClose: () => void;
  onBreak: () => void;
  onResume: () => void;
  onGarden: () => void;
  onTalk: () => void;
}) {
  return (
    <Modal
      title="You can put it down for a moment."
      eyebrow="A LITTLE SPACE, JUST FOR YOU"
      className="rest-space"
      onClose={onClose}
    >
      <div className="rest-landscape" aria-hidden="true">
        <div className="rest-orbit" />
        <Leaf size={48} strokeWidth={1} />
        <span>inhale a little space. exhale the rush.</span>
      </div>
      <div className="rest-message">
        <Pill tone="neutral">
          {message ? 'AI suggestion · may be mistaken' : 'A simple invitation · no AI assessment'}
        </Pill>
        <p>
          {message?.message ??
            (session.task && session.task !== 'A moment to reset'
              ? `“${session.task}” can wait a little. Save the thought you want to return to, then let your eyes settle somewhere beyond this screen.`
              : 'Let your shoulders drop. Look at something a little farther away. There isn’t a right way to spend this moment.')}
        </p>
        {message && (
          <small>
            Broad screen description: {message.observation}. Screen sharing is now off. This is not
            a fatigue or attention assessment.
          </small>
        )}
      </div>
      <div className="rest-choices">
        <button onClick={onGarden}>
          <Flower2 size={23} />
          <strong>A tiny garden</strong>
          <span>Six cards. No score. Leave at any time.</span>
        </button>
        <button onClick={onTalk}>
          <MessageCircle size={23} />
          <strong>Talk it through</strong>
          <span>A little conversation, without the pep-talk loop.</span>
        </button>
      </div>
      <div className="rest-footnote">
        A game or chat is optional screen time, not eye rest. You don’t have to do either.
      </div>
      <div className="modal-actions rest-controls">
        {session.phase === 'paused' && (
          <Button variant="ghost" disabled={busy} onClick={onResume}>
            <Play size={15} />
            Resume my work
          </Button>
        )}
        {['break', 'breakPaused'].includes(session.phase) ? (
          <Pill>Break timer · {formatTimer(session.remainingMs)}</Pill>
        ) : (
          <Button disabled={busy} onClick={onBreak}>
            <Coffee size={16} />
            Start a {minutes}-minute break
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Leave this space
        </Button>
      </div>
      <p className="rest-footnote">
        {session.phase === 'paused'
          ? 'Your work timer is paused. Leaving won’t restart it.'
          : 'You choose when to start, finish, or return. Nothing else on your computer is blocked.'}
      </p>
    </Modal>
  );
}
