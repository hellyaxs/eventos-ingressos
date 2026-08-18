import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import QrScanner from 'qr-scanner';
import { apiFetch } from '../lib/api';
import { pagePath, type PaginatedResponse } from '../lib/pagination';

type EventItem = {
  id: string;
  title: string;
  posterUrl: string | null;
  venue: string;
  startsAt: string;
  priceCents: number;
  capacity: number;
  saleMode: 'SEAT_MAP' | 'GA_QTY';
  seatsSold?: number;
};

type GateValidation = {
  status: 'VALID' | 'INVALID' | 'ALREADY_USED' | 'WRONG_EVENT';
};

const RESULT_LABEL: Record<GateValidation['status'], string> = {
  VALID: '✓ Ingresso válido',
  INVALID: '✗ Ingresso inválido',
  ALREADY_USED: '✗ Ingresso já utilizado',
  WRONG_EVENT: '✗ Ingresso não pertence a este evento',
};

const pageStyle: CSSProperties = {
  background: 'var(--color-bg)',
  color: 'var(--color-fg)',
  minHeight: '100vh',
};

const titleStyle: CSSProperties = {
  margin: '0.25rem 0 0.75rem',
  color: 'var(--color-fg)',
};

const statusStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-fg)',
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.9rem',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  fontSize: '0.95rem',
  font: 'inherit',
  color: 'var(--color-fg)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  boxSizing: 'border-box',
};

const primaryButtonStyle: CSSProperties = {
  width: '100%',
  padding: '0.7rem 1rem',
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--color-bg)',
  background: 'var(--color-fg)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};

const primaryButtonDisabledStyle: CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const secondaryButtonStyle: CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.95rem',
  font: 'inherit',
  fontWeight: 600,
  color: 'var(--color-fg)',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};

const videoStyle: CSSProperties = {
  width: '100%',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)',
};

const successStyle: CSSProperties = {
  color: 'var(--color-success)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-success)',
};

const errorStyle: CSSProperties = {
  color: 'var(--color-error)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-error)',
};

const resultPanelStyle: CSSProperties = {
  margin: 0,
  padding: '0.75rem 1rem',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  fontSize: '1rem',
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    try {
      const data = JSON.parse(err.message) as { message?: unknown };
      if (typeof data.message === 'string' && data.message.length > 0) {
        return data.message;
      }
    } catch {
      // fall through
    }
    return err.message;
  }
  return 'Falha inesperada. Tente novamente.';
}

export const Route = createFileRoute('/gate')({
  component: GatePage,
});

function GatePage() {
  const [eventId, setEventId] = useState('');
  const [ticketCode, setTicketCode] = useState('');
  const [result, setResult] = useState<GateValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;

  const events = useQuery({
    queryKey: ['events', 'gate'],
    queryFn: () =>
      apiFetch<PaginatedResponse<EventItem>>(
        pagePath('/api/events', 1, { limit: '50' }),
      ),
    retry: false,
  });

  const eventItems = events.data?.items ?? [];

  useEffect(() => {
    if (eventItems.length > 0 && !eventId) {
      setEventId(eventItems[0].id);
    }
  }, [eventItems, eventId]);

  const selectedEvent = useMemo(
    () => eventItems.find((event) => event.id === eventId) ?? null,
    [eventItems, eventId],
  );

  const performValidation = useCallback(async (code: string) => {
    const target = eventIdRef.current;
    const trimmed = code.trim();
    if (!target || !trimmed) {
      return;
    }
    setValidating(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<GateValidation>(`/api/gate/${target}/validate`, {
        method: 'POST',
        body: JSON.stringify({ ticketCode: trimmed }),
      });
      setResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setValidating(false);
    }
  }, []);

  useEffect(() => {
    if (!showScanner || !videoRef.current) {
      return;
    }
    const scanner = new QrScanner(
      videoRef.current,
      (decoded) => {
        const code = decoded.data.trim().toUpperCase();
        scanner.stop();
        scanner.destroy();
        scannerRef.current = null;
        setShowScanner(false);
        setScannerError(null);
        setTicketCode(code);
        void performValidation(code);
      },
      {},
    );
    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => setScannerError(null))
      .catch(() => {
        setScannerError(
          'Não foi possível acessar a câmera. Verifique as permissões do navegador.',
        );
      });
    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [showScanner, performValidation]);

  const handleToggleScanner = () => {
    setScannerError(null);
    setShowScanner((prev) => {
      if (prev && scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
      return !prev;
    });
  };

  const resultStyles = result
    ? result.status === 'VALID'
      ? successStyle
      : errorStyle
    : undefined;

  return (
    <section className="app-page" style={pageStyle}>
      <p className="eyebrow">Controle de acesso</p>
      <h1 style={titleStyle}>Validação de ingressos</h1>

      <label
        htmlFor="gate-event"
        style={{ ...mutedStyle, display: 'block', marginBottom: '0.375rem' }}
      >
        Evento
      </label>
      {events.isLoading ? (
        <p className="status spinner" style={statusStyle}>
          Carregando…
        </p>
      ) : events.isError ? (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          ✗ Não foi possível carregar os eventos.
        </p>
      ) : (
        <select
          id="gate-event"
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
          style={fieldStyle}
        >
          {eventItems.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      )}

      {selectedEvent ? (
        <p style={{ ...mutedStyle, marginTop: '0.5rem' }}>
          {selectedEvent.title} · {selectedEvent.venue}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem' }}>
        <label
          htmlFor="gate-code"
          style={{ ...mutedStyle, display: 'block', marginBottom: '0.375rem' }}
        >
          Código do ingresso
        </label>
        <input
          id="gate-code"
          type="text"
          value={ticketCode}
          onChange={(event) => setTicketCode(event.target.value.toUpperCase())}
          placeholder="CENA-XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          style={fieldStyle}
        />

        <button
          type="button"
          disabled={validating || !eventId || !ticketCode.trim()}
          onClick={() => void performValidation(ticketCode)}
          style={
            validating || !eventId || !ticketCode.trim()
              ? primaryButtonDisabledStyle
              : primaryButtonStyle
          }
        >
          {validating ? 'Validando…' : 'Validar ingresso'}
        </button>

        <button type="button" onClick={handleToggleScanner} style={secondaryButtonStyle}>
          {showScanner ? 'Cancelar leitura' : 'Ler QR Code'}
        </button>
      </div>

      {scannerError ? (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          ✗ {scannerError}
        </p>
      ) : null}

      {showScanner ? (
        <div style={{ marginTop: '1rem' }}>
          <video ref={videoRef} muted playsInline style={videoStyle} />
        </div>
      ) : null}

      {error ? (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          ✗ {error}
        </p>
      ) : null}

      {result ? (
        <p style={{ ...resultPanelStyle, ...resultStyles }}>{RESULT_LABEL[result.status]}</p>
      ) : null}
    </section>
  );
}