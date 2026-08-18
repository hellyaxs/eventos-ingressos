import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
  createFileRoute,
  redirect,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { restoreSession } from '../lib/auth';
import { formatDateTime, formatPrice } from '../lib/format';
import { DuplicateNotice } from '../components/DuplicateNotice';
import { HoldCountdown } from '../components/HoldCountdown';
import { PurchaseStepper } from '../components/PurchaseStepper';
import { SeatMap3D } from '../components/SeatMap3D';

type SeatMapEvent = {
  id: string;
  title: string;
  posterUrl: string | null;
  venue: string;
  startsAt: string;
  priceCents: number;
  capacity: number;
  saleMode: 'SEAT_MAP' | 'GA_QTY';
  rows: number;
  cols: number;
  seatsSold: number;
  seats: Array<{
    id: string;
    label: string;
    row: number;
    col: number;
    available: boolean;
    owned?: boolean;
  }>;
};

type HoldReservation = {
  id: string;
  status: 'HOLD';
  expiresAt: string;
  createdAt: string;
  event: {
    id: string;
    title: string;
    venue: string;
    startsAt: string;
    posterUrl: string | null;
  };
  seats: string[];
};

type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

const mutedStyle: CSSProperties = {
  color: 'var(--color-secondary)',
  fontSize: 'var(--font-size-sm)',
};

const errorStyle: CSSProperties = {
  color: 'var(--color-error)',
  fontSize: 'var(--font-size-sm)',
};

const panelStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-4)',
};

const stickySummaryStyle: CSSProperties = {
  position: 'sticky',
  bottom: 'var(--space-4)',
  zIndex: 2,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-4)',
};

const seatGridStyle = (cols: number): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, 2.25rem)`,
  gap: '0.4rem',
  justifyContent: 'center',
});

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const trimmed = text.trim();
  if (!trimmed) return 'Algo deu errado.';
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.message === 'string') return parsed.message;
    return trimmed;
  } catch {
    return trimmed;
  }
}

function parseSeatLabels(message: string): string[] {
  const match = /\(([^)]+)\)/.exec(message);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
}

function keepAvailableSelection(
  current: string[],
  seats: SeatMapEvent['seats'] | undefined,
  dropLabels: string[],
): string[] {
  if (!seats || seats.length === 0) {
    return current;
  }
  const blocked = new Set(dropLabels);
  return current.filter((id) => {
    const seat = seats.find((item) => item.id === id);
    if (!seat) return false;
    if (blocked.has(seat.label) || seat.owned) return false;
    return seat.available;
  });
}

export const Route = createFileRoute('/reserve')({
  beforeLoad: async () => {
    if (!(await restoreSession())) {
      throw redirect({ to: '/login' });
    }
  },
  component: ReservePage,
});

function ReservePage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as unknown as {
    eventId?: string;
  };
  const eventId = search.eventId?.trim() ?? '';
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictSeats, setConflictSeats] = useState<string[] | null>(null);
  const [view, setView] = useState<'3d' | 'list'>('3d');

  const seatMapQuery = useQuery({
    queryKey: ['seat-map', eventId],
    queryFn: () => apiFetch<SeatMapEvent>(`/api/events/${eventId}/seats`),
    enabled: Boolean(eventId),
    retry: false,
  });

  const holdsQuery = useQuery({
    queryKey: ['reservations'],
    queryFn: () =>
      apiFetch<PaginatedResponse<HoldReservation>>(
        '/api/reservations?page=1&limit=100',
      ),
    retry: false,
  });

  const activeHolds = useMemo(() => {
    const now = Date.now();
    return (holdsQuery.data?.items ?? []).filter(
      (hold) => new Date(hold.expiresAt).getTime() > now,
    );
  }, [holdsQuery.data]);

  const eventHolds = useMemo(
    () =>
      eventId
        ? activeHolds.filter((hold) => hold.event.id === eventId)
        : [],
    [activeHolds, eventId],
  );

  const soonestExpiresAt = useMemo(() => {
    if (eventHolds.length === 0) return null;
    return eventHolds.reduce((soonest, hold) => {
      return new Date(hold.expiresAt).getTime() < new Date(soonest).getTime()
        ? hold.expiresAt
        : soonest;
    }, eventHolds[0].expiresAt);
  }, [eventHolds]);

  const seatMap = seatMapQuery.data;

  const rows = useMemo(() => {
    const grouped: Array<SeatMapEvent['seats']> = [];
    if (!seatMap) return grouped;
    for (let row = 1; row <= seatMap.rows; row += 1) {
      grouped.push(
        seatMap.seats.filter((seat) => seat.row === row).sort((a, b) => a.col - b.col),
      );
    }
    return grouped;
  }, [seatMap]);

  const selectedSeats = useMemo(() => {
    if (!seatMap) return [];
    return seatMap.seats.filter((seat) => selected.includes(seat.id));
  }, [seatMap, selected]);

  const toggleSeat = useCallback((id: string) => {
    const seat = seatMapQuery.data?.seats.find((item) => item.id === id);
    if (!seat || !seat.available || seat.owned) {
      if (seat?.owned) {
        setError('Você já comprou este ingresso');
        setConflictSeats([seat.label]);
      }
      return;
    }
    setError(null);
    setConflictSeats(null);
    setSelected((current) =>
      current.includes(id)
        ? current.filter((seatId) => seatId !== id)
        : [...current, id],
    );
  }, [seatMapQuery.data]);

  const handleUnsupported = useCallback(() => {
    setView('list');
  }, []);

  async function reserve() {
    if (!eventId || selected.length === 0 || reserving) return;
    setReserving(true);
    setError(null);
    setConflictSeats(null);
    try {
      const result = await apiFetch<{ reservationIds: string[] }>(
        `/api/events/${eventId}/reserve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seatIds: selected }),
        },
      );
      void navigate({
        to: '/checkout',
        search: {
          reservationIds: result.reservationIds.join(','),
        } as never,
      });
    } catch (err) {
      const message = errorMessage(err);
      setError(message);

      await queryClient.invalidateQueries({ queryKey: ['seat-map', eventId] });
      await queryClient.invalidateQueries({ queryKey: ['reservations'] });

      const fresh = queryClient.getQueryData<SeatMapEvent>([
        'seat-map',
        eventId,
      ]);
      const seats = fresh?.seats ?? seatMap?.seats;

      if (message.includes('já comprou')) {
        const labels = parseSeatLabels(message);
        setConflictSeats(labels);
        setSelected((current) => keepAvailableSelection(current, seats, labels));
      } else if (message.includes('Assento indisponível')) {
        if (fresh?.seats) {
          setSelected((current) =>
            keepAvailableSelection(current, fresh.seats, []),
          );
        }
      }
    } finally {
      setReserving(false);
    }
  }

  const continueButton = (
    <button
      type="button"
      className="login-submit"
      disabled={selected.length === 0 || reserving}
      onClick={() => {
        void reserve();
      }}
    >
      {reserving ? 'Reservando…' : 'Continuar para pagamento'}
    </button>
  );

  return (
    <section className="app-page app-page-wide">
      <PurchaseStepper current={2} eventId={eventId || undefined} />
      <p className="eyebrow">Plataforma de eventos</p>
      <h1>Reservar ingresso</h1>
      <p style={mutedStyle}>
        Escolha seus assentos e confirme no checkout. As reservas expiram em 10 minutos.{' '}
        <a href="/events" className="text-link">
          Ver eventos
        </a>
      </p>

      {soonestExpiresAt ? (
        <HoldCountdown expiresAt={soonestExpiresAt} />
      ) : null}

      {eventId ? (
        seatMapQuery.isLoading ? (
          <p className="status spinner">Carregando mapa de assentos…</p>
        ) : seatMapQuery.isError ? (
          <p className="status" data-state="error">
            {errorMessage(seatMapQuery.error)}
          </p>
        ) : seatMap?.saleMode === 'GA_QTY' ? (
          <p className="status">
            Este evento é de entrada geral — a reserva online de assentos não é suportada.
          </p>
        ) : seatMap ? (
          <div style={panelStyle}>
            <h2 style={{ margin: 0 }}>{seatMap.title}</h2>
            <p style={mutedStyle}>
              {seatMap.venue} · {formatDateTime(seatMap.startsAt)} ·{' '}
              {formatPrice(seatMap.priceCents)}
            </p>
            <p style={mutedStyle}>
              {seatMap.seatsSold} de {seatMap.capacity} ingressos vendidos
            </p>

            <div className="view-toggle" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className="view-toggle-button"
                aria-pressed={view === '3d'}
                onClick={() => setView('3d')}
              >
                {view === '3d' ? '▸ ' : '  '}Mapa 3D
              </button>
              <button
                type="button"
                className="view-toggle-button"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                {view === 'list' ? '▸ ' : '  '}Lista
              </button>
            </div>

            {view === '3d' ? (
              <SeatMap3D
                seats={seatMap.seats}
                rows={seatMap.rows}
                cols={seatMap.cols}
                selectedIds={selected}
                onToggleSeat={toggleSeat}
                interactive={!reserving}
                onUnsupported={handleUnsupported}
              />
            ) : (
              <div aria-label="Mapa de assentos" style={seatGridStyle(seatMap.cols)}>
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} style={{ display: 'contents' }}>
                    {row.map((seat) => (
                      <button
                        key={seat.id}
                        type="button"
                        className="seat-button"
                        data-selected={selected.includes(seat.id) ? 'true' : 'false'}
                        data-owned={seat.owned ? 'true' : 'false'}
                        aria-disabled={!seat.available || Boolean(seat.owned)}
                        aria-pressed={selected.includes(seat.id)}
                        disabled={!seat.available || Boolean(seat.owned)}
                        title={
                          seat.owned
                            ? 'Você já comprou este ingresso'
                            : !seat.available
                              ? 'Assento ocupado'
                              : `Assento ${seat.label}`
                        }
                        onClick={() => toggleSeat(seat.id)}
                      >
                        {seat.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="seat-legend">
              <span>
                <i className="seat-dot" data-kind="free" />
                Disponível
              </span>
              <span>
                <i className="seat-dot" data-kind="selected" />
                Selecionado
              </span>
              <span>
                <i className="seat-dot" data-kind="taken" />
                Ocupado
              </span>
              <span>
                <i className="seat-dot" data-kind="owned" />
                Seu ingresso
              </span>
            </div>

            {conflictSeats ? (
              <DuplicateNotice
                variant="conflict"
                seats={conflictSeats.length > 0 ? conflictSeats : undefined}
              />
            ) : error ? (
              <p style={errorStyle}>{error}</p>
            ) : null}

            {selectedSeats.length > 0 ? (
              <div style={stickySummaryStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <strong>
                    {selectedSeats.map((seat) => seat.label).join(', ')}
                  </strong>
                  <span style={mutedStyle}>
                    {formatPrice(selected.length * seatMap.priceCents)}
                  </span>
                </div>
                {continueButton}
              </div>
            ) : (
              <>
                <p style={mutedStyle}>Selecione ao menos um assento.</p>
                <div>{continueButton}</div>
              </>
            )}
          </div>
        ) : null
      ) : activeHolds.length === 0 ? (
        <p className="status">
          Nenhum assento reservado ainda. Selecione um evento para começar.{' '}
          <a href="/events" className="text-link">
            Ver eventos
          </a>
        </p>
      ) : null}

      {activeHolds.length > 0 ? (
        <div style={panelStyle}>
          <h2 style={{ margin: 0 }}>Reservas em andamento</h2>
          {activeHolds.map((hold) => (
            <div key={hold.id} className="hold-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <strong>{hold.event.title}</strong>
                <span style={mutedStyle}>
                  Assentos: {hold.seats.join(', ') || '—'} · Válida até{' '}
                  {formatDateTime(hold.expiresAt)}
                </span>
              </div>
              <a
                href={`/checkout?reservationIds=${encodeURIComponent(hold.id)}`}
                className="text-link"
              >
                Continuar
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
