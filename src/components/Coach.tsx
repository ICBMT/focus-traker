import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Leaf, RotateCcw, ShieldCheck, Sparkles, Square } from 'lucide-react';
import { recentChatContext } from '../core/ai';
import type { AiConnection } from '../core/ai';
import type { ChatMessage } from '../core/types';
import { offlineGuidance } from '../core/guidance';
import { runtime } from '../lib/runtime';
import { Button, Modal, Pill } from './ui';

export default function Coach({
  ai,
  task,
  onClose,
  onSettings,
}: {
  ai: AiConnection;
  task: string;
  onClose: () => void;
  onSettings: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [includeTask, setIncludeTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const nativeAi = ai.source === 'ollama' && ai.connected && ai.acknowledged && !!ai.model;
  useEffect(() => {
    scroll.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, busy]);
  useEffect(() => {
    const stop = () => {
      generation.current += 1;
      setBusy(false);
      void runtime.stopChat().catch(() => {});
    };
    window.addEventListener('focus:pause-sensors', stop);
    return () => {
      generation.current += 1;
      void runtime.stopChat().catch(() => {});
      window.removeEventListener('focus:pause-sensors', stop);
    };
  }, []);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const message = text.trim().slice(0, 1000);
    const next: ChatMessage[] = [...messages.slice(-13), { role: 'user', content: message }];
    setMessages(next);
    setInput('');
    setError('');
    if (!nativeAi) {
      setMessages([
        ...next,
        { role: 'assistant', content: offlineGuidance(message, includeTask ? task : undefined) },
      ]);
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    try {
      const response = await runtime.chat(
        ai.port,
        ai.model,
        recentChatContext(next),
        includeTask ? task : null,
      );
      if (token === generation.current)
        setMessages([...next, { role: 'assistant', content: response }]);
    } catch (e) {
      if (token === generation.current)
        setError(
          typeof e === 'string'
            ? e
            : e instanceof Error
              ? e.message
              : 'The model could not respond. No fallback provider was used.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const stop = () => {
    generation.current += 1;
    setBusy(false);
    void runtime.stopChat().catch(() => {});
  };
  const close = () => {
    stop();
    onClose();
  };
  return (
    <Modal
      title="A little room to think."
      eyebrow="YOUR FOCUS COMPANION"
      onClose={close}
      className="coach-drawer"
    >
      <div className="coach-provider">
        <Pill tone={nativeAi ? 'green' : 'neutral'} dot>
          {nativeAi ? `Ollama · ${ai.model}` : 'Offline guidance · not an AI model'}
        </Pill>
        <button
          onClick={() => {
            stop();
            onSettings();
          }}
        >
          Change
        </button>
      </div>
      <div className="chat-scroll">
        <div className="coach-welcome">
          <span className="coach-avatar">
            <Leaf size={22} />
          </span>
          <h3>One small step is enough.</h3>
          <p>
            {nativeAi
              ? 'Want to untangle a thought, find a first step, or just talk for a minute? This AI conversation sees only your messages and the task text you approve—not your screen.'
              : 'A few hand-written prompts to help you begin, untangle a thought, or make room for rest. No model or connection required.'}
          </p>
        </div>
        {messages.length === 0 && (
          <div className="chat-suggestions">
            {[
              'Help me find a starting point',
              'I’m feeling stuck',
              'I could use a short break',
            ].map((text) => (
              <button key={text} onClick={() => void send(text)}>
                <Sparkles size={14} />
                {text}
                <ArrowUp size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="chat-messages" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, i) => (
            <div className={`chat-message ${message.role}`} key={`${i}-${message.role}`}>
              <span className="message-author">
                {message.role === 'user'
                  ? 'YOU'
                  : nativeAi
                    ? 'FOCUS · AI'
                    : 'FOCUS · OFFLINE PROMPT'}
              </span>
              <p>{message.content}</p>
            </div>
          ))}
          {busy && (
            <div className="chat-working">
              <span className="spinner" />
              Waiting for your local model…
            </div>
          )}
        </div>
        {error && (
          <div className="inline-warning" role="status">
            {error}
            <br />
            <button
              onClick={() => {
                stop();
                onSettings();
              }}
            >
              Choose offline guidance instead
            </button>
          </div>
        )}
        <div ref={scroll} />
      </div>
      <div className="coach-compose">
        {task && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeTask}
              onChange={(e) => setIncludeTask(e.target.checked)}
            />
            <span>Include my current task as context</span>
          </label>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label className="sr-only" htmlFor="coach-input">
            Message your companion
          </label>
          <textarea
            id="coach-input"
            data-autofocus
            placeholder="What’s on your mind?"
            rows={2}
            maxLength={1000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button
            type={busy ? 'button' : 'submit'}
            aria-label={busy ? 'Stop model response' : 'Send message'}
            disabled={!busy && !input.trim()}
            onClick={busy ? stop : undefined}
          >
            {busy ? <Square size={16} /> : <ArrowUp size={19} />}
          </button>
        </form>
        <div className="chat-footer">
          <span>
            <ShieldCheck size={12} />
            Text-only conversation. Clears when closed.
          </span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                stop();
                setMessages([]);
                setError('');
              }}
            >
              <RotateCcw size={12} />
              Start fresh
            </button>
          )}
        </div>
      </div>
      <div className="coach-disclaimer">
        <Check size={13} />
        <span>
          {nativeAi
            ? 'Recent context only. Cancel stops the client; the server may keep generating.'
            : 'A supportive tool, not a therapist or a mood detector.'}
        </span>
      </div>
      <Button variant="ghost" className="sr-only" onClick={close}>
        Close companion
      </Button>
    </Modal>
  );
}
