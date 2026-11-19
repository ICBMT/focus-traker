import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  CircleHelp,
  FlaskConical,
  Keyboard,
  LockKeyhole,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  VideoOff,
} from 'lucide-react';
import { makeBaseline, RhythmAccumulator } from '../core/rhythm';
import type { RhythmBaseline, RhythmResult, RhythmSummary } from '../core/rhythm';
import type { RuntimeInfo, WorkStyle } from '../core/types';
import { runtime } from '../lib/runtime';
import { Button, Modal, Pill, Toggle } from './ui';

const emptySummary = (): RhythmSummary => ({
  keyCount: 0,
  pointerEvents: 0,
  editingCount: 0,
  clicks: 0,
  scrolls: 0,
  intervals: [0, 0, 0, 0, 0],
  observedMs: 0,
});

export default function Sensors({
  info,
  onActivity,
  onNotice,
}: {
  info: RuntimeInfo;
  onActivity: (active: boolean) => void;
  onNotice: (message: string) => void;
}) {
  const [cameraState, setCameraState] = useState<'off' | 'requesting' | 'live'>('off');
  const [cameraError, setCameraError] = useState('');
  const [cameraConsent, setCameraConsent] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [labEnabled, setLabEnabled] = useState(false);
  const [labConsent, setLabConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pointer, setPointer] = useState(false);
  const [workStyle, setWorkStyle] = useState<WorkStyle>('deep');
  const accumulator = useRef(new RhythmAccumulator(performance.now()));
  const [summary, setSummary] = useState<RhythmSummary>(emptySummary);
  const [baseline, setBaseline] = useState<RhythmBaseline | null>(null);
  const [comparison, setComparison] = useState<RhythmResult>({
    status: 'unknown',
    reason: 'Start the test pad to see only the input you deliberately provide here.',
  });
  const labGeneration = useRef(0);
  const [labEpoch, setLabEpoch] = useState(0);

  const stopCamera = useCallback(() => {
    generation.current += 1;
    stream.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraState('off');
  }, []);
  const stopLab = useCallback(() => {
    labGeneration.current += 1;
    setLabEnabled(false);
    accumulator.current.reset(performance.now());
    setSummary(emptySummary());
    setBaseline(null);
    setComparison({
      status: 'unknown',
      reason: 'Test stopped. Volatile input summaries and the comparison sample were cleared.',
    });
  }, []);

  useEffect(() => {
    onActivity(cameraState === 'live' || labEnabled);
  }, [cameraState, labEnabled, onActivity]);
  useEffect(() => {
    const stop = () => {
      stopCamera();
      stopLab();
    };
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('focus:pause-sensors', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('focus:pause-sensors', stop);
      document.removeEventListener('visibilitychange', hidden);
      generation.current += 1;
      stream.current?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      stream.current = null;
      labGeneration.current += 1;
      accumulator.current.reset(performance.now());
      onActivity(false);
    };
  }, [stopCamera, stopLab, onActivity]);

  const startCamera = async () => {
    setCameraConsent(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera capture is unavailable in this runtime. Use a secure context or test the native app. Your timer works without it.',
      );
      return;
    }
    const token = ++generation.current;
    setCameraState('requesting');
    setCameraError('');
    try {
      const capture = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } },
        audio: false,
      });
      if (token !== generation.current || document.hidden) {
        capture.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = capture;
      capture.getVideoTracks().forEach((track) => {
        track.onended = () => {
          stopCamera();
          setCameraError(
            'Camera access ended. Capture is off; no observations were inferred from the gap.',
          );
        };
      });
      if (video.current) {
        video.current.srcObject = capture;
        await video.current.play();
      }
      if (token === generation.current) setCameraState('live');
    } catch (error) {
      if (token !== generation.current) return;
      stopCamera();
      const name = error instanceof DOMException ? error.name : '';
      setCameraError(
        name === 'NotAllowedError'
          ? 'Camera access was not granted. Check your browser/site or OS permissions. Embedded previews may restrict camera access; the timer needs no permission.'
          : name === 'NotFoundError'
            ? 'No camera was found. You can keep using Focus without one.'
            : name === 'NotReadableError'
              ? 'The camera is busy or unavailable. Close other capture apps and try again when you choose.'
              : 'The camera could not start in this runtime. Capture is off; try the native app or continue without it.',
      );
    }
  };

  useEffect(() => {
    if (!labEnabled) return;
    const token = labGeneration.current;
    let pending = false;
    const tick = async () => {
      const next = accumulator.current.snapshot(performance.now());
      setSummary(next);
      if (pending) return;
      pending = true;
      try {
        const result = await runtime.rhythm(next, baseline);
        if (token === labGeneration.current) setComparison(result);
      } catch {
        if (token === labGeneration.current)
          setComparison({
            status: 'unknown',
            reason: 'The feature engine is unavailable. No input-state inference will be made.',
          });
      } finally {
        pending = false;
      }
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [labEnabled, baseline, labEpoch]);

  const resetSample = () => {
    labGeneration.current += 1;
    setLabEpoch(labGeneration.current);
    accumulator.current.reset(performance.now());
    setSummary(emptySummary());
    setBaseline(null);
    setComparison({ status: 'unknown', reason: 'New context, new sample. No mood is inferred.' });
  };
  const saveBaseline = () => {
    const sample = makeBaseline(accumulator.current.snapshot(performance.now()));
    if (!sample) {
      onNotice(
        'Collect at least eight valid typing intervals over five seconds before saving a sample.',
      );
      return;
    }
    labGeneration.current += 1;
    setBaseline(sample);
    accumulator.current.reset(performance.now());
    setSummary(emptySummary());
    onNotice(
      'Comparison sample saved in memory for this test only. It is not a boredom or flow calibration.',
    );
  };

  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">AWARENESS, WITH YOUR PERMISSION</div>
        <h1>Only what you choose.</h1>
        <p>Meet the three inputs. Try a small experiment. Stay in control.</p>
      </div>
      <div className="sensor-summary">
        {[
          {
            icon: Camera,
            title: 'Webcam',
            value: cameraState === 'live' ? 'Preview on' : 'Off by default',
            detail: 'Foreground capture only',
          },
          {
            icon: Keyboard,
            title: 'Keyboard',
            value: labEnabled ? 'Test pad active' : 'Not collecting',
            detail: 'Test-pad scope, not global',
          },
          {
            icon: MousePointer2,
            title: 'Mouse & trackpad',
            value: labEnabled && pointer ? 'Test pad active' : 'Not collecting',
            detail: 'No cursor paths retained',
          },
        ].map((item) => (
          <div className="card sensor-summary-card" key={item.title}>
            <span className="sensor-summary-icon">
              <item.icon size={23} strokeWidth={1.5} />
            </span>
            <h2>{item.title}</h2>
            <Pill
              tone={
                item.value.includes('active') || item.value === 'Preview on' ? 'green' : 'neutral'
              }
              dot
            >
              {item.value}
            </Pill>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      <div className="notice-banner">
        <FlaskConical size={21} />
        <div>
          <strong>A calibration lab, not background monitoring</strong>
          <p>
            No fatigue, boredom, or mood detector is active. Global input, idle adapters, and
            background vision still need native feasibility testing.
          </p>
        </div>
      </div>
      <div className="sensor-grid">
        <section className="card camera-card">
          <div className="card-heading">
            <div>
              <h2>A window, not a recording</h2>
              <p>Webcam capture lifecycle experiment.</p>
            </div>
            <Pill tone="neutral">No vision model loaded</Pill>
          </div>
          <div className={`camera-stage ${cameraState === 'live' ? 'live' : ''}`}>
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label="Your live camera preview"
              className={cameraState === 'live' ? 'visible' : ''}
            />
            {cameraState !== 'live' && (
              <div className="camera-placeholder">
                <span>
                  <CameraOff size={31} strokeWidth={1.25} />
                </span>
                <h3>
                  {cameraState === 'requesting'
                    ? 'Waiting for your permission…'
                    : 'Your camera is off.'}
                </h3>
                <p>
                  {cameraState === 'requesting'
                    ? 'You can cancel without granting access.'
                    : 'Your space, your choice. Nothing is captured until you start.'}
                </p>
              </div>
            )}
            {cameraState === 'live' && (
              <span className="camera-live">
                <span className="status-dot" />
                LIVE · ON THIS DEVICE
              </span>
            )}
          </div>
          {cameraError && (
            <div className="inline-warning" role="status">
              {cameraError}
            </div>
          )}
          <div className="camera-controls">
            {cameraState === 'off' ? (
              <Button variant="secondary" onClick={() => setCameraConsent(true)}>
                <Camera size={16} />
                Try camera preview
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopCamera}>
                <Square size={14} />
                {cameraState === 'requesting' ? 'Cancel request' : 'Stop camera'}
              </Button>
            )}
            <span>
              <LockKeyhole size={13} />
              No recording. No upload. No microphone.
            </span>
          </div>
          <div className="sensor-footnote">
            <CircleHelp size={15} />
            <p>
              Preview stops on page exit, a hidden tab, or Pause all. Capturing video does not prove
              usable eye tracking or reliable minimized/background capture. Native WebView behavior
              remains unverified.
            </p>
          </div>
        </section>
        <section className="card capability-card">
          <div className="card-heading">
            <div>
              <h2>Honest about what’s available</h2>
              <p>Capability is not the same as consent.</p>
            </div>
            <ShieldCheck size={20} className="green-text" />
          </div>
          <dl className="capability-list">
            <div>
              <dt>Runtime</dt>
              <dd>{info.kind === 'desktop' ? `Tauri · ${info.platform}` : 'Browser preview'}</dd>
            </div>
            <div>
              <dt>Session engine</dt>
              <dd>{info.engine === 'rust' ? 'Rust · native' : 'Browser adapter'}</dd>
            </div>
            <div>
              <dt>Input experiment</dt>
              <dd>Test pad only</dd>
            </div>
            <div>
              <dt>Global input / idle</dt>
              <dd>Not integrated</dd>
            </div>
            <div>
              <dt>Camera analysis</dt>
              <dd>Not integrated</dd>
            </div>
            <div>
              <dt>Desktop glow / lock</dt>
              <dd>Not enabled</dd>
            </div>
            <div>
              <dt>Notification sources</dt>
              <dd>None connected</dd>
            </div>
          </dl>
          <div className="capability-explanation">
            <VideoOff size={20} />
            <h3>No signal is a valid state.</h3>
            <p>
              Reading, thinking, assistive input, and unavailable permissions never count as proof
              of disengagement.
            </p>
          </div>
        </section>
      </div>
      <section className="card rhythm-lab">
        <div className="card-heading">
          <div>
            <div className="eyebrow">PERSONAL INPUT RHYTHM · EXPERIMENTAL</div>
            <h2>A pattern, not a personality test.</h2>
            <p>Coarse summaries in memory. Never words, key sequences, or pointer trails.</p>
          </div>
          <Pill tone="amber">Test pad only</Pill>
        </div>
        <div className="lab-settings">
          <label>
            Work style
            <select
              value={workStyle}
              onChange={(e) => {
                setWorkStyle(e.target.value as WorkStyle);
                resetSample();
              }}
            >
              <option value="deep">Deep work</option>
              <option value="reading">Reading & learning</option>
              <option value="creative">Creative work</option>
            </select>
          </label>
          <div>
            <span>Pointer activity</span>
            <Toggle
              label="Count pointer activity in the test pad"
              checked={pointer}
              onChange={(next) => {
                setPointer(next);
                resetSample();
              }}
            />
          </div>
          <div>
            <span>Editing-key counts</span>
            <Toggle
              label="Count Backspace and Delete in the test pad"
              checked={editing}
              onChange={(next) => {
                setEditing(next);
                resetSample();
              }}
            />
          </div>
        </div>
        <div
          className={`test-pad ${labEnabled ? 'enabled' : ''}`}
          role="textbox"
          aria-label="Rhythm test pad"
          aria-readonly={!labEnabled}
          tabIndex={labEnabled ? 0 : -1}
          onKeyDown={(event) => {
            if (
              !labEnabled ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              ['Tab', 'Escape', 'Shift', 'Control', 'Meta', 'Alt'].includes(event.key)
            )
              return;
            event.preventDefault();
            accumulator.current.key(
              performance.now(),
              editing && ['Backspace', 'Delete'].includes(event.key),
              event.repeat,
            );
          }}
          onPointerMove={() => {
            if (labEnabled && pointer) accumulator.current.pointer(performance.now(), 'move');
          }}
          onClick={() => {
            if (labEnabled && pointer) accumulator.current.pointer(performance.now(), 'click');
          }}
          onWheel={() => {
            if (labEnabled && pointer) accumulator.current.pointer(performance.now(), 'scroll');
          }}
        >
          <Keyboard size={26} strokeWidth={1.4} />
          <strong>
            {labEnabled
              ? 'Click here. Type naturally. Move your pointer.'
              : 'Your input test pad is off.'}
          </strong>
          <p>
            {labEnabled
              ? 'Characters are not displayed or retained. Only this pad is observed—not other apps.'
              : 'Start deliberately. Stop at any time. The rest of your computer is not monitored.'}
          </p>
        </div>
        <div className="lab-metrics">
          {[
            ['Key presses', summary.keyCount],
            ['Pointer moves', pointer ? summary.pointerEvents : '—'],
            ['Editing keys', editing ? summary.editingCount : '—'],
            ['Observation', `${Math.floor(summary.observedMs / 1000)}s / 30s`],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="lab-bottom">
          <div className="rhythm-result" aria-live="polite">
            <Pill
              tone={
                comparison.status === 'unknown'
                  ? 'neutral'
                  : comparison.status === 'changed'
                    ? 'amber'
                    : 'green'
              }
            >
              {comparison.status === 'unknown'
                ? 'Unknown / learning'
                : comparison.status === 'steady'
                  ? 'Similar rhythm'
                  : 'Rhythm changed'}
            </Pill>
            <p>{comparison.reason}</p>
          </div>
          <div className="lab-buttons">
            {labEnabled ? (
              <>
                <Button variant="secondary" onClick={saveBaseline}>
                  <Check size={15} />
                  Use current sample
                </Button>
                <Button variant="secondary" onClick={stopLab}>
                  <Pause size={15} />
                  Stop test
                </Button>
                <button
                  className="icon-button"
                  aria-label="Reset input sample"
                  onClick={resetSample}
                >
                  <RotateCcw size={17} />
                </button>
              </>
            ) : (
              <Button onClick={() => setLabConsent(true)}>
                <Play size={15} />
                Try input rhythm
              </Button>
            )}
          </div>
        </div>
        <div className="sensor-footnote">
          <ShieldCheck size={15} />
          <p>
            The comparison is an unvalidated cadence-distance rule. A sample is not a psychological
            baseline. It never triggers a lock, game, or notification action. Pointer metrics are
            counts only; movement-style classification is not implemented.
          </p>
        </div>
      </section>
      {cameraConsent && (
        <Modal
          title="A preview, with your permission."
          eyebrow="CAMERA CONSENT"
          onClose={() => setCameraConsent(false)}
        >
          <p className="modal-description">
            Focus will ask for video access—never audio. The live preview stays on this device and
            is not recorded, uploaded, or analyzed for mood.
          </p>
          <ul className="consent-list">
            <li>
              <Check size={16} />
              Stops when you leave this page, hide it, or pause.
            </li>
            <li>
              <Check size={16} />
              No eye/fatigue model or background vision is active.
            </li>
            <li>
              <Check size={16} />
              OS/browser permission can be denied or revoked.
            </li>
          </ul>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setCameraConsent(false)}>
              Not now
            </Button>
            <Button onClick={() => void startCamera()}>
              <Camera size={16} />
              Start camera preview
            </Button>
          </div>
        </Modal>
      )}
      {labConsent && (
        <Modal
          title="Try a pattern. Keep your privacy."
          eyebrow="INPUT-RHYTHM CONSENT"
          onClose={() => setLabConsent(false)}
        >
          <p className="modal-description">
            Only the test pad is observed. It keeps bounded counts and coarse interval buckets in
            memory for up to 30 seconds. No characters, raw keystroke sequence, or cursor path is
            retained or sent to a model.
          </p>
          <p className="modal-description">
            Optional editing-key counts are not an error rate. Stop clears the summaries and sample.
            This test cannot establish boredom, mood, or flow.
          </p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setLabConsent(false)}>
              Not now
            </Button>
            <Button
              onClick={() => {
                labGeneration.current += 1;
                accumulator.current.reset(performance.now());
                setLabEnabled(true);
                setLabConsent(false);
                setComparison({
                  status: 'unknown',
                  reason:
                    'Collecting your deliberate test-pad input. No baseline or mood inference yet.',
                });
              }}
            >
              <Keyboard size={16} />
              Start test-pad experiment
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
