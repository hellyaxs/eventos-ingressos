import { useMemo, useState } from 'react';
import {
  createFileRoute,
  redirect,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { DuplicateNotice } from '../components/DuplicateNotice';
import { HoldCountdown } from '../components/HoldCountdown';
import { PurchaseStepper } from '../components/PurchaseStepper';
import { apiFetch } from '../lib/api';
import { restoreSession } from '../lib/auth';
import { formatDateTime, formatPrice } from '../lib/format';
import { pagePath, type PaginatedResponse } from '../lib/pagination';

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
    priceCents: number;
  };
  seats: string[];
};

type TicketInfo = {
  code: string;
  seatLabel: string | null;
  status: string;
};

type Payment = {
  id: string;
  reservationId: string;
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  simulatedOutcome: string | null;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
  reservation?: {
    id: string;
    status: string;
    eventId?: string;
    seat?: { label: string } | null;
    event?: {
      id?: string;
      title?: string;
      venue?: string;
      startsAt?: string;
      posterUrl?: string | null;
    };
  };
  tickets: TicketInfo[];
};

type Outcome = 'approve' | 'reject';
type ResultState = { outcome: Outcome; payments: Payment[] };

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

function isConflictMessage(message: string): boolean {
  return message.toLowerCase().includes('já comprou');
}

function seatsFromConflict(message: string, fallback: string[]): string[] {
  const match = message.match(/\(([^)]+)\)/);
  if (!match?.[1]) return fallback;
  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function ticketSeats(payments: Payment[]): string[] {
  return payments.flatMap((payment) =>
    (payment.tickets ?? [])
      .map((ticket) => ticket.seatLabel)
      .filter((label): label is string => Boolean(label)),
  );
}

function paymentEventId(payment: Payment): string | undefined {
  return payment.reservation?.event?.id ?? payment.reservation?.eventId;
}

function earliestExpiresAt(holds: HoldReservation[]): string {
  return holds.reduce((earliest, hold) =>
    hold.expiresAt < earliest ? hold.expiresAt : earliest,
  holds[0].expiresAt);
}

export const Route = createFileRoute('/checkout')({
  beforeLoad: async () => {
    if (!(await restoreSession())) {
      throw redirect({ to: '/login' });
    }
  },
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as unknown as {
    reservationIds?: string;
  };

  const reservationIds = useMemo(
    () =>
      (search.reservationIds ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [search.reservationIds],
  );

  const [busy, setBusy] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [conflictSeats, setConflictSeats] = useState<string[] | null>(null);

  const holdsQuery = useQuery({
    queryKey: ['reservations'],
    queryFn: () =>
      apiFetch<PaginatedResponse<HoldReservation>>(
        pagePath('/api/reservations', 1, { limit: '50' }),
      ),
    enabled: reservationIds.length > 0,
    retry: false,
  });

  const holds = useMemo(() => {
    const all = holdsQuery.data?.items ?? [];
    return all.filter((hold) => reservationIds.includes(hold.id));
  }, [holdsQuery.data, reservationIds]);

  const missingIds = useMemo(() => {
    if (!holdsQuery.isFetched) return [];
    return reservationIds.filter((id) => !holds.some((hold) => hold.id === id));
  }, [reservationIds, holds, holdsQuery.isFetched]);

  const lookups = useQueries({
    queries: missingIds.map((id) => ({
      queryKey: ['payment-by-reservation', id],
      queryFn: () => apiFetch<Payment>(`/api/payments/by-reservation/${id}`),
      retry: false,
    })),
  });

  const firstHold = holds[0];
  const eventId = firstHold?.event.id;
  const seats = useMemo(() => holds.flatMap((hold) => hold.seats), [holds]);
  const seatCount = seats.length;
  const unitPrice = firstHold?.event.priceCents ?? 0;
  const totalCents = holds.reduce(
    (sum, hold) => sum + hold.seats.length * hold.event.priceCents,
    0,
  );

  const lookupsPending = lookups.some((query) => query.isPending);
  const pageLoading =
    reservationIds.length > 0 &&
    (!holdsQuery.isFetched || (holds.length === 0 && lookupsPending));

  const payLocked = conflictSeats !== null;
  const showPayActions = result === null;

  function goToTickets() {
    void navigate({
      to: '/tickets',
      search: { justPaid: '1' } as never,
    });
  }

  function goToEvents() {
    void navigate({ to: '/events' });
  }

  function goToReserve(targetEventId?: string) {
    if (!targetEventId) {
      goToEvents();
      return;
    }
    void navigate({ to: '/reserve', search: { eventId: targetEventId } as never });
  }

  async function pollPayment(paymentId: string): Promise<Payment> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const payment = await apiFetch<Payment>(`/api/payments/${paymentId}`);
      if (payment.status !== 'PENDING') return payment;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Ainda processando — atualize em instantes');
  }

  async function runPayments(outcome: Outcome) {
    if (payLocked || busy !== null) return;
    setBusy(outcome);
    setError(null);
    setResult(null);
    try {
      const created = await apiFetch<Payment[]>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          reservationIds: holds.map((hold) => hold.id),
          simulatedOutcome: outcome,
        }),
      });
      const finalized = await Promise.all(
        created.map((payment) => pollPayment(payment.id)),
      );
      setResult({ outcome, payments: finalized });
    } catch (err) {
      const message = errorMessage(err);
      if (isConflictMessage(message)) {
        setConflictSeats(seatsFromConflict(message, seats));
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  const approved =
    result?.payments.some((payment) => payment.status === 'APPROVED') ?? false;
  const rejected =
    result !== null &&
    result.payments.length > 0 &&
    result.payments.every((payment) => payment.status === 'REJECTED');

  return (
    <section className="app-page">
      <p className="eyebrow">Checkout</p>
      {holds.length === 0 ? (
        <PurchaseStepper current={pageLoading ? 3 : approvedLookupStep(lookups)} />
      ) : (
        <PurchaseStepper current={approved ? 4 : 3} eventId={eventId} />
      )}
      <h1>Pagamento</h1>

      {reservationIds.length === 0 ? (
        <article className="order-card">
          <p style={{ margin: 0, color: 'var(--color-secondary)' }}>
            Nenhum pedido em andamento
          </p>
          <a
            href="/events"
            className="text-link"
            onClick={(event) => {
              event.preventDefault();
              goToEvents();
            }}
          >
            Escolher um evento
          </a>
        </article>
      ) : null}

      {pageLoading ? (
        <p className="status spinner">Carregando seu pedido…</p>
      ) : null}

      {!pageLoading && holds.length > 0 && firstHold ? (
        <article className="order-card">
          {firstHold.event.posterUrl ? (
            <img
              src={firstHold.event.posterUrl}
              alt=""
              className="order-card-poster"
            />
          ) : null}

          <div>
            <h2 style={{ margin: 0 }}>{firstHold.event.title}</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--color-secondary)' }}>
              {firstHold.event.venue} · {formatDateTime(firstHold.event.startsAt)}
            </p>
          </div>

          <p style={{ margin: 0 }}>Assentos {seats.join(', ')}</p>
          <p style={{ margin: 0 }}>
            {seatCount} × {formatPrice(unitPrice)}
          </p>
          <p style={{ margin: 0 }}>
            Total <strong>{formatPrice(totalCents)}</strong>
          </p>

          {showPayActions ? (
            <HoldCountdown expiresAt={earliestExpiresAt(holds)} />
          ) : null}

          {payLocked ? (
            <DuplicateNotice variant="conflict" seats={conflictSeats} />
          ) : result && approved ? (
            <DuplicateNotice variant="approved" seats={ticketSeats(result.payments)} />
          ) : rejected ? (
            <DuplicateNotice variant="rejected" />
          ) : (
            <DuplicateNotice variant="prepay" />
          )}

          {result && approved ? (
            <ApprovedCodes payments={result.payments} />
          ) : null}

          <div className="checkout-actions">
            {showPayActions && payLocked ? (
              <TicketsCta onNavigate={goToTickets} />
            ) : showPayActions ? (
              <>
                <button
                  type="button"
                  className="cta cta-primary"
                  disabled={busy !== null}
                  onClick={() => void runPayments('approve')}
                >
                  {busy === 'approve' ? 'Confirmando…' : 'Confirmar compra'}
                </button>
                <details className="demo-details">
                  <summary>Opções de demonstração</summary>
                  <button
                    type="button"
                    className="cta"
                    disabled={busy !== null}
                    onClick={() => void runPayments('reject')}
                    style={{
                      color: 'var(--color-error)',
                      borderColor: 'var(--color-error)',
                    }}
                  >
                    {busy === 'reject' ? 'Processando…' : 'Simular recusa'}
                  </button>
                </details>
              </>
            ) : approved ? (
              <div className="cta-row" style={{ marginTop: 0 }}>
                <TicketsCta onNavigate={goToTickets} />
                <a
                  href={`/reserve?eventId=${encodeURIComponent(eventId ?? '')}`}
                  className="cta"
                  onClick={(event) => {
                    event.preventDefault();
                    goToReserve(eventId);
                  }}
                >
                  Escolher outro assento
                </a>
              </div>
            ) : rejected ? (
              <a
                href={
                  eventId
                    ? `/reserve?eventId=${encodeURIComponent(eventId)}`
                    : '/events'
                }
                className="cta cta-primary"
                onClick={(event) => {
                  event.preventDefault();
                  goToReserve(eventId);
                }}
              >
                Voltar ao mapa
              </a>
            ) : null}

            <details className="demo-details">
              <summary>Detalhes técnicos</summary>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {holds.map((hold) => (
                  <li key={hold.id}>
                    <code>{hold.id}</code>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {error ? (
            <p className="status" data-state="error" role="status">
              {error}
            </p>
          ) : null}
        </article>
      ) : null}

      {!pageLoading
        ? missingIds.map((id, index) => (
            <LookupResult
              key={id}
              reservationId={id}
              payment={lookups[index]?.data}
              isPending={lookups[index]?.isPending ?? false}
              isError={lookups[index]?.isError ?? false}
              navigateToTickets={goToTickets}
              navigateToReserve={goToReserve}
              navigateToEvents={goToEvents}
            />
          ))
        : null}
    </section>
  );
}

function approvedLookupStep(
  lookups: Array<{ data?: Payment; isError?: boolean }>,
): 3 | 4 {
  if (lookups.some((query) => query.data?.status === 'APPROVED')) return 4;
  return 3;
}

function TicketsCta({ onNavigate }: { onNavigate: () => void }) {
  return (
    <a
      href="/tickets?justPaid=1"
      className="cta cta-primary"
      onClick={(event) => {
        event.preventDefault();
        onNavigate();
      }}
    >
      Ver ingressos
    </a>
  );
}

function ApprovedCodes({ payments }: { payments: Payment[] }) {
  const tickets = payments.flatMap((payment) => payment.tickets ?? []);
  if (tickets.length === 0) return null;

  return (
    <ul
      aria-live="polite"
      style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-fg)' }}
    >
      {tickets.map((ticket) => (
        <li key={ticket.code}>
          <code>{ticket.code}</code>
          {ticket.seatLabel ? ` · ${ticket.seatLabel}` : null}
        </li>
      ))}
    </ul>
  );
}

function LookupResult({
  reservationId,
  payment,
  isPending,
  isError,
  navigateToTickets,
  navigateToReserve,
  navigateToEvents,
}: {
  reservationId: string;
  payment: Payment | undefined;
  isPending: boolean;
  isError: boolean;
  navigateToTickets: () => void;
  navigateToReserve: (eventId?: string) => void;
  navigateToEvents: () => void;
}) {
  const knownEventId = payment ? paymentEventId(payment) : undefined;
  const reserveHref = knownEventId
    ? `/reserve?eventId=${encodeURIComponent(knownEventId)}`
    : '/events';

  if (isPending) {
    return (
      <article className="order-card">
        <p className="status spinner">Carregando seu pedido…</p>
      </article>
    );
  }

  if (isError || !payment) {
    return (
      <article className="order-card">
        <DuplicateNotice variant="expired" />
        <a
          href={reserveHref}
          className="cta cta-primary"
          onClick={(event) => {
            event.preventDefault();
            if (knownEventId) navigateToReserve(knownEventId);
            else navigateToEvents();
          }}
        >
          Escolher de novo
        </a>
        <details className="demo-details">
          <summary>Detalhes técnicos</summary>
          <code>{reservationId}</code>
        </details>
      </article>
    );
  }

  if (payment.status === 'APPROVED') {
    const seats = ticketSeats([payment]);
    return (
      <article className="order-card">
        <DuplicateNotice variant="approved" seats={seats} />
        <ApprovedCodes payments={[payment]} />
        <TicketsCta onNavigate={navigateToTickets} />
        <details className="demo-details">
          <summary>Detalhes técnicos</summary>
          <code>{reservationId}</code>
        </details>
      </article>
    );
  }

  if (payment.status === 'REJECTED') {
    return (
      <article className="order-card">
        <DuplicateNotice variant="rejected" />
        <a
          href={reserveHref}
          className="text-link"
          onClick={(event) => {
            event.preventDefault();
            if (knownEventId) navigateToReserve(knownEventId);
            else navigateToEvents();
          }}
        >
          Voltar ao mapa
        </a>
        <details className="demo-details">
          <summary>Detalhes técnicos</summary>
          <code>{reservationId}</code>
        </details>
      </article>
    );
  }

  return (
    <article className="order-card">
      <p className="status spinner">Ainda processando — atualize em instantes</p>
      <details className="demo-details">
        <summary>Detalhes técnicos</summary>
        <code>{reservationId}</code>
      </details>
    </article>
  );
}
