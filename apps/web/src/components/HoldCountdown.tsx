import { useEffect, useState, type JSX } from 'react';

function remainingSeconds(expiresAt: string): number {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
}

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function HoldCountdown(props: { expiresAt: string }): JSX.Element {
  const { expiresAt } = props;
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(expiresAt));

  useEffect(() => {
    setSecondsLeft(remainingSeconds(expiresAt));
    const id = window.setInterval(() => {
      setSecondsLeft(remainingSeconds(expiresAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const expired = secondsLeft <= 0;
  const urgent = !expired && secondsLeft < 60;
  const className = urgent ? 'hold-countdown is-urgent' : 'hold-countdown';

  let label = `Reserva expira em ${formatMmSs(secondsLeft)}`;
  if (urgent) {
    label = `Expira em instantes · ${label}`;
  }
  if (expired) {
    label = 'A reserva expirou.';
  }

  return (
    <div
      className={className}
      aria-live="polite"
      data-expired={expired ? 'true' : undefined}
    >
      {label}
    </div>
  );
}
