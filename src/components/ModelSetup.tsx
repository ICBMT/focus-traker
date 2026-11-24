import { useEffect, useRef, useState } from 'react';
import { Check, HardDrive, Monitor, Unplug, WifiOff } from 'lucide-react';
import type { AiConnection } from '../core/ai';
import type { RuntimeInfo } from '../core/types';
import { runtime } from '../lib/runtime';
import { Button } from './ui';

// The exact same consent/connection controls are used in Preferences and setup.
// Connections and routing acknowledgement deliberately remain launch-local.
export default function ModelSetup({
  ai,
  info,
  onChange,
  onNotice,
}: {
  ai: AiConnection;
  info: RuntimeInfo;
  onChange: (patch: Partial<AiConnection>) => void;
  onNotice: (message: string) => void;
}) {
  const [port, setPort] = useState(String(ai.port));
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const invalidate = () => {
    generation.current += 1;
    setConnecting(false);
    setError('');
  };
  const connect = async () => {
    const number = Number(port);
    if (!Number.isInteger(number) || number < 1 || number > 65535) {
      setError('Choose a port between 1 and 65535.');
      return;
    }
    if (info.kind !== 'desktop' || !ai.acknowledged || connecting) return;
    const token = ++generation.current;
    setConnecting(true);
    setError('');
    // A failed reconnect must never leave an older server/model marked ready.
    onChange({ connected: false, source: 'offline', models: [], model: '' });
    try {
      const models = await runtime.models(number);
      if (token !== generation.current) return;
      onChange({
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
    } catch (cause) {
      if (token === generation.current)
        setError(
          typeof cause === 'string'
            ? cause
            : cause instanceof Error
              ? cause.message
              : 'The local endpoint could not be reached.',
        );
    } finally {
      if (token === generation.current) setConnecting(false);
    }
  };
  return (
    <>
      <div className="provider-options">
        <button
          type="button"
          className={`provider-option ${ai.source === 'offline' ? 'selected' : ''}`}
          onClick={() => {
            invalidate();
            onChange({ source: 'offline' });
          }}
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
          disabled={!ai.connected || !ai.model || !ai.acknowledged || connecting}
          onClick={() => onChange({ source: 'ollama' })}
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
          Rust connects to <code>127.0.0.1</code> only. This hosted web preview never calls your
          computer’s localhost.
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
              invalidate();
              setPort(e.target.value);
              onChange({ connected: false, source: 'offline', models: [], model: '' });
            }}
            disabled={connecting}
          />
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ai.acknowledged}
            onChange={(e) => {
              invalidate();
              onChange({
                acknowledged: e.target.checked,
                connected: false,
                source: 'offline',
                models: [],
                model: '',
              });
            }}
          />
          <span>
            I understand a loopback server can use cloud-backed routes. I’ll configure Ollama’s
            no-cloud settings for local-only use.
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
        {error && (
          <div className="inline-warning" role="status">
            {error}
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
              onChange={(e) => onChange({ model: e.target.value })}
            >
              {ai.models.length ? (
                ai.models.map((model) => (
                  <option value={model.name} key={model.name}>
                    {model.name}
                    {model.size > 0 ? ` · ${(model.size / 1e9).toFixed(1)} GB download` : ''}
                  </option>
                ))
              ) : (
                <option value="">No eligible installed models</option>
              )}
            </select>
            <p>
              No automatic downloads. Known cloud tags are excluded, but server-side routing is not
              independently verified. Vision support is checked separately when sharing.
            </p>
            {ai.model.startsWith('qwen2.5-coder:3b') && (
              <div className="inline-warning">
                This model has Qwen Research License restrictions. Review its license before
                commercial or non-research use.
              </div>
            )}
            <button
              className="text-link"
              type="button"
              onClick={() => {
                invalidate();
                onChange({ connected: false, model: '', models: [], source: 'offline' });
              }}
            >
              <Unplug size={14} />
              Disconnect model
            </button>
          </div>
        )}
        <p>
          Model connections and the routing acknowledgement are for this launch only. Setup never
          saves them as permission or downloads a model.
        </p>
      </div>
    </>
  );
}
