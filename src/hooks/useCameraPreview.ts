import { useCallback, useEffect, useRef, useState } from 'react';

// Shared by the foreground sensor lab and the optional setup test. Merely
// mounting this hook never queries or requests a device/OS permission.
export function useCameraPreview(onActivity?: (active: boolean) => void) {
  const [state, setState] = useState<'off' | 'requesting' | 'live'>('off');
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const opening = useRef(false);
  const release = useCallback(() => {
    generation.current += 1;
    opening.current = false;
    stream.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setState('off');
  }, [release]);

  useEffect(() => {
    onActivity?.(state === 'live');
  }, [state, onActivity]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('focus:pause-sensors', stop);
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('focus:pause-sensors', stop);
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', hidden);
      release();
      onActivity?.(false);
    };
  }, [stop, release, onActivity]);

  const start = async () => {
    if (opening.current || stream.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Camera capture is unavailable in this runtime. Use a secure context or test the native app. Your timer works without it.',
      );
      return;
    }
    const token = ++generation.current;
    opening.current = true;
    setState('requesting');
    setError('');
    try {
      const capture = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } },
        audio: false,
      });
      if (token !== generation.current || document.hidden) {
        capture.getTracks().forEach((track) => track.stop());
        if (token === generation.current) stop();
        return;
      }
      stream.current = capture;
      capture.getVideoTracks().forEach((track) => {
        track.onended = () => {
          stop();
          setError(
            'Camera access ended. Capture is off; no observations were inferred from the gap.',
          );
        };
      });
      if (video.current) {
        video.current.srcObject = capture;
        await video.current.play();
      }
      if (token === generation.current) setState('live');
    } catch (cause) {
      if (token !== generation.current) return;
      stop();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was not granted. Check your browser/site or OS permissions. Embedded previews may restrict camera access; the timer needs no permission.'
          : name === 'NotFoundError'
            ? 'No camera was found. You can keep using Focus without one.'
            : name === 'NotReadableError'
              ? 'The camera is busy or unavailable. Close other capture apps and try again when you choose.'
              : 'The camera could not start in this runtime. Capture is off; try the native app or continue without it.',
      );
    } finally {
      if (token === generation.current) opening.current = false;
    }
  };
  return { state, error, video, start, stop };
}
