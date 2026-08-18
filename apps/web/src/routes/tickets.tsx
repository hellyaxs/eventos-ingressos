import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createFileRoute, redirect, useSearch } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { toDataURL } from 'qrcode';
import { DuplicateNotice } from '../components/DuplicateNotice';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { PurchaseStepper } from '../components/PurchaseStepper';
import { apiFetch } from '../lib/api';
import { restoreSession } from '../lib/auth';
import { pagePath, type PaginatedResponse } from '../lib/pagination';

type TicketSummary = {
  id: string;
  eventId: string;
  paymentId: string;
  code: string;
  shareToken: string;
  status: 'ISSUED' | string;
  seatLabel: string;
  usedAt: string | null;
  createdAt: string;
  event: {
    title: string;
    venue: string;
    startsAt: string;
    posterUrl: string | null;
  } | null;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

const pageStyle: CSSProperties = {
  background: 'var(--color-bg)',
  color: 'var(--color-fg)',
  minHeight: '100vh',
};

const titleStyle: CSSProperties = {
  margin: '0.25rem 0 0.75rem',
  color: 'var(--color-fg)',
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '1rem',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '0.75rem',
};

const strongStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 600,
  color: 'var(--color-fg)',
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.85rem',
};

const badgeStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-fg)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.2rem 0.6rem',
};

const codeStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const codeLabelStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const codeValueStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.95rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: 'var(--color-fg)',
  wordBreak: 'break-all',
};

const shareStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-muted)',
  fontSize: '0.75rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  wordBreak: 'break-all',
};

const qrWrapStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '0.5rem 0',
};

const qrImageStyle: CSSProperties = {
  width: 160,
  height: 160,
  background: 'var(--color-primary)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.5rem',
  boxSizing: 'border-box',
};

function TicketQr({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 180 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-error)' }}>
        ✗ Não foi possível gerar o QR.
      </p>
    );
  }

  if (!dataUrl) {
    return (
      <p className="status spinner" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-secondary)' }}>
        Gerando QR…
      </p>
    );
  }

  return <img src={dataUrl} alt={`QR do código ${code}`} style={qrImageStyle} />;
}

function ShareActions({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === 'undefined'
      ? `/share/${shareToken}`
      : `${window.location.origin}/share/${shareToken}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={shareActionsStyle}>
      <button type="button" className="cta" onClick={() => void copyLink()}>
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
      <a href={url} className="cta cta-primary">
        ▸ Abrir share
      </a>
    </div>
  );
}

const statusStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-fg)',
};

const shareActionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginTop: '0.25rem',
};

const ctaStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: '1rem',
};

export const Route = createFileRoute('/tickets')({
  beforeLoad: async () => {
    if (!(await restoreSession())) {
      throw redirect({ to: '/login' });
    }
  },
  component: TicketsPage,
});

function TicketsPage() {
  const search = useSearch({ strict: false }) as unknown as {
    justPaid?: string | boolean | number;
  };
  const justPaid =
    search.justPaid === '1' || search.justPaid === true || search.justPaid === 1;

  const tickets = useInfiniteQuery({
    queryKey: ['tickets'],
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<TicketSummary>>(pagePath('/api/tickets', pageParam)),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    retry: false,
  });

  const items = tickets.data?.pages.flatMap((page) => page.items) ?? [];
  const loadMore = useCallback(() => {
    if (tickets.hasNextPage && !tickets.isFetchingNextPage) {
      void tickets.fetchNextPage();
    }
  }, [tickets]);

  return (
    <section className="app-page app-page-wide" style={pageStyle}>
      <p className="eyebrow">Plataforma de eventos</p>
      <PurchaseStepper current={4} />
      <h1 style={titleStyle}>Meus ingressos</h1>

      {justPaid ? <DuplicateNotice variant="approved" /> : null}

      <p className="login-hint">
        <a href="/events" className="text-link">
          Escolher outro assento
        </a>
      </p>

      {tickets.isLoading ? (
        <p className="status spinner" style={statusStyle}>
          Carregando…
        </p>
      ) : tickets.isError ? (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          Não foi possível carregar seus ingressos.
        </p>
      ) : items.length === 0 ? (
        <>
          <p className="status" style={statusStyle}>
            Você ainda não tem ingressos.
          </p>
          <a href="/events" className="cta cta-primary" style={ctaStyle}>
            ▸ Ver eventos
          </a>
        </>
      ) : (
        <>
          <div className="tickets-grid">
            {items.map((ticket) => (
              <article key={ticket.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <h2 style={strongStyle}>{ticket.event?.title ?? 'Ingresso'}</h2>
                  <span style={badgeStyle}>{ticket.status}</span>
                </div>
                {ticket.event ? (
                  <p style={mutedStyle}>
                    {ticket.event.venue} · {formatDate(ticket.event.startsAt)}
                  </p>
                ) : null}
                <p style={mutedStyle}>Assento: {ticket.seatLabel}</p>
                <div style={qrWrapStyle}>
                  <TicketQr code={ticket.code} />
                </div>
                <div style={codeStyle}>
                  <p style={codeLabelStyle}>Seu código</p>
                  <code style={codeValueStyle}>{ticket.code}</code>
                </div>
                <div style={codeStyle}>
                  <p style={codeLabelStyle}>Compartilhar ingresso</p>
                  <p style={shareStyle}>{`/share/${ticket.shareToken}`}</p>
                  <ShareActions shareToken={ticket.shareToken} />
                </div>
              </article>
            ))}
          </div>
          <InfiniteSentinel
            onVisible={loadMore}
            disabled={!tickets.hasNextPage || tickets.isFetchingNextPage}
          />
          {tickets.isFetchingNextPage ? (
            <p className="status spinner" style={statusStyle}>
              Carregando mais ingressos…
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}