import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { PurchaseStepper } from '../components/PurchaseStepper';
import { apiFetch } from '../lib/api';
import { getToken } from '../lib/auth';
import { pagePath, type PaginatedResponse } from '../lib/pagination';
import { useMe } from '../lib/use-me';

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
  alreadyPurchased?: boolean;
  ownedSeatLabels?: string[];
};

const SALE_MODE_LABEL: Record<EventItem['saleMode'], string> = {
  SEAT_MAP: 'Mapa de assentos',
  GA_QTY: 'Entrada geral',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

const titleStyle: CSSProperties = {
  margin: '0.25rem 0 0.75rem',
  color: 'var(--color-fg)',
};

const filterStyle: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  fontSize: '0.95rem',
  font: 'inherit',
  color: 'var(--color-fg)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.85rem',
};

const statusStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-fg)',
};

export const Route = createFileRoute('/events')({
  component: EventsPage,
});

function EventCardBody({ event }: { event: EventItem }): ReactNode {
  return (
    <>
      {event.alreadyPurchased ? (
        <span className="owned-badge">Você já possui ingresso</span>
      ) : null}
      {event.posterUrl ? (
        <img src={event.posterUrl} alt={`Cartaz de ${event.title}`} className="event-card-poster" />
      ) : (
        <div className="event-card-poster event-card-poster-fallback" aria-hidden="true">
          {event.title.trim().charAt(0).toUpperCase()}
        </div>
      )}
      <h2 className="event-card-title">{event.title}</h2>
      <p style={mutedStyle}>{event.venue}</p>
      <p style={mutedStyle}>{formatDate(event.startsAt)}</p>
      <p style={mutedStyle}>
        Capacidade: {event.capacity} · {SALE_MODE_LABEL[event.saleMode]}
      </p>
      <p className="event-card-price">{formatPrice(event.priceCents)}</p>
      {event.alreadyPurchased && event.ownedSeatLabels?.length ? (
        <p style={mutedStyle}>
          Seus assentos: {event.ownedSeatLabels.join(', ')}
        </p>
      ) : null}
      {event.saleMode === 'SEAT_MAP' ? (
        <span
          className="cta cta-primary"
          style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
        >
          {event.alreadyPurchased
            ? '▸ Escolher outro assento'
            : '▸ Escolher assento'}
        </span>
      ) : null}
      {typeof event.seatsSold === 'number' ? (
        <p style={mutedStyle}>{event.seatsSold} ingressos vendidos</p>
      ) : null}
    </>
  );
}

function EventsPage() {
  const token = getToken();
  const me = useMe();
  const [query, setQuery] = useState('');
  const search = query.trim();

  const events = useInfiniteQuery({
    queryKey: ['events', search],
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<EventItem>>(
        pagePath('/api/events', pageParam, { q: search || undefined }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    retry: false,
  });

  const items = events.data?.pages.flatMap((page) => page.items) ?? [];
  const loadMore = useCallback(() => {
    if (events.hasNextPage && !events.isFetchingNextPage) {
      void events.fetchNextPage();
    }
  }, [events]);

  return (
    <section className="app-page app-page-wide">
      <p className="eyebrow">Plataforma de eventos</p>
      <PurchaseStepper current={1} />
      <h1 style={titleStyle}>Eventos</h1>

      <p className="login-hint">
        {me.data?.role === 'ORGANIZER' ? (
          <a href="/org" className="text-link">
            Gerenciar eventos
          </a>
        ) : token ? (
          <a href="/tickets" className="text-link">
            Meus ingressos
          </a>
        ) : (
          <a href="/login" className="text-link">
            Entrar para participar
          </a>
        )}
      </p>

      <label
        htmlFor="events-search"
        style={{ ...mutedStyle, display: 'block', marginBottom: '0.375rem' }}
      >
        Buscar por título ou local
      </label>
      <input
        id="events-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="ex.: Festival, São Paulo"
        style={filterStyle}
      />

      {events.isLoading ? (
        <p className="status" style={statusStyle}>
          Carregando…
        </p>
      ) : events.isError ? (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          ✗ Não foi possível carregar os eventos.
        </p>
      ) : items.length === 0 ? (
        <p className="status" style={statusStyle}>
          Nenhum evento encontrado. Confira novamente em breve.
        </p>
      ) : (
        <>
          <div className="events-grid">
            {items.map((event) =>
              event.saleMode === 'SEAT_MAP' ? (
                <a
                  key={event.id}
                  href={`/reserve?eventId=${event.id}`}
                  className="event-card event-card-link"
                >
                  <EventCardBody event={event} />
                </a>
              ) : (
                <article key={event.id} className="event-card">
                  <EventCardBody event={event} />
                </article>
              ),
            )}
          </div>
          <InfiniteSentinel
            onVisible={loadMore}
            disabled={!events.hasNextPage || events.isFetchingNextPage}
          />
          {events.isFetchingNextPage ? (
            <p className="status spinner" style={statusStyle}>
              Carregando mais eventos…
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
