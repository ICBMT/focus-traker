import { useEffect, useRef, useState } from 'react';
import { companionRuntime } from '../lib/companion';
import { Button, Modal } from './ui';

export default function GnomeInstall({ inline = false }: { inline?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const details = (
    <>
      <p className="modal-description">
        Write or replace the bundled extension files and MIT license under your user data
        directory’s <code>gnome-shell/extensions/focus-companion@icbmt</code> folder. No
        administrator access, automatic activation, autostart, or system-wide changes.
      </p>
      <p className="modal-description">
        Then enable “Focus desktop companion” in GNOME Extensions yourself. On Wayland, log out and
        back in if it is not listed; do not restart Shell in-place. Targets GNOME Shell 45–50; other
        desktops keep the movable compact timer. Physical GNOME validation is still a release gate.
      </p>
      <div className="modal-actions">
        <Button variant="ghost" disabled={installing} onClick={() => setConfirm(false)}>
          Cancel
        </Button>
        <Button
          disabled={installing}
          onClick={async () => {
            if (pending.current) return;
            pending.current = true;
            setInstalling(true);
            try {
              const message = await companionRuntime.installGnome();
              if (mounted.current) {
                setResult(message);
                setConfirm(false);
              }
            } catch (cause) {
              if (mounted.current)
                setResult(
                  typeof cause === 'string'
                    ? cause
                    : cause instanceof Error
                      ? cause.message
                      : 'The extension could not be installed.',
                );
            } finally {
              pending.current = false;
              if (mounted.current) setInstalling(false);
            }
          }}
        >
          {installing ? 'Installing files…' : 'Install bundled files'}
        </Button>
      </div>
    </>
  );
  return (
    <div className="gnome-install">
      <Button variant="secondary" onClick={() => setConfirm(true)} disabled={installing}>
        Install GNOME companion…
      </Button>
      {result && (
        <p className="inline-warning" role="status">
          {result}
        </p>
      )}
      {confirm &&
        (inline ? (
          <section className="setup-inset" aria-label="Confirm GNOME extension installation">
            <h4>Install the optional GNOME companion?</h4>
            {details}
          </section>
        ) : (
          <Modal
            title="Install the optional GNOME companion?"
            eyebrow="USER-LEVEL DESKTOP INTEGRATION"
            onClose={() => {
              if (!installing) setConfirm(false);
            }}
          >
            {details}
          </Modal>
        ))}
    </div>
  );
}
