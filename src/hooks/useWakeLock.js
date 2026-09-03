import { useEffect, useRef } from 'react';

// Keeps the screen from sleeping while the app is open and visible.
// Uses the Screen Wake Lock API where supported; no-ops otherwise.
export function useWakeLock() {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let cancelled = false;

    const requestWakeLock = async () => {
      if (wakeLockRef.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release();
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener('release', () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
      } catch (err) {
        // iOS WebKit rejects a wake lock request made without a recent user
        // gesture (e.g. on page load), so the click/touch listener below
        // retries once the visitor actually interacts with the page.
        console.warn('Wake lock request failed:', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', requestWakeLock);
    document.addEventListener('touchstart', requestWakeLock);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', requestWakeLock);
      document.removeEventListener('touchstart', requestWakeLock);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);
}
