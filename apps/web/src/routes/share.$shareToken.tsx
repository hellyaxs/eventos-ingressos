import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

type ShareData = {
  status: 'ISSUED' | 'USED';
  seatLabel: string | null;
  usedAt: string | null;
  event: {
    title: string;
    venue: string;
    startsAt: string;
    posterUrl: string | null;
  };
};

const pageStyle: CSSProperties = {
  background: 'var(--color-bg)',
  color: 'var(--color-fg)',
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '1.25rem',
};

const posterStyle: CSSProperties = {
  width: '100%',
  height: 200,
  objectFit: 'cover',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)',
  display: 'block',
};

const placeholderStyle: CSSProperties = {
  width: '100%',
  height: 200,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-secondary)',
  fontSize: '3rem',
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.4rem',
  fontWeight: 700,
  color: 'var(--color-fg)',
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.9rem',
};

const badgeStyle: CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.6rem 0.9rem',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  textAlign: 'center',
  fontSize: '0.95rem',
};

const validStyle: CSSProperties = {
  ...badgeStyle,
  color: 'var(--color-bg)',
  background: 'var(--color-success)',
};

const usedStyle: CSSProperties = {
  ...badgeStyle,
  color: 'var(--color-fg)',
  background: 'var(--color-error)',
};

const statusStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-fg)',
  maxWidth: 420,
  width: '100%',
};

const ctaAreaStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  marginTop: '0.75rem',
};

const ctaFeedbackStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

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

export const Route = createFileRoute('/share/$shareToken')({
  component: SharePage,
});

function SharePage() {
  const { shareToken } = useParams({ from: '/share/$shareToken' });

  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState('ok');
    } catch {
      setCopyState('err');
    }
  }, []);

  const share = useQuery<ShareData>({
    queryKey: ['share', shareToken],
    queryFn: () => apiFetch<ShareData>(`/api/share/${shareToken}`),
    retry: false,
  });

  const content = useMemo(() => {
    if (share.isLoading) {
      return (
        <p className="status spinner" style={statusStyle}>
          Carregando…
        </p>
      );
    }

    if (share.isError) {
      const detail = errorMessage(share.error);
      return (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          ✗ {detail}
        </p>
      );
    }

    if (!share.data) {
      return (
        <p className="status spinner" style={statusStyle}>
          Carregando…
        </p>
      );
    }

    const data = share.data;
    return (
      <article style={cardStyle}>
        {data.event.posterUrl ? (
          <img src={data.event.posterUrl} alt="" style={posterStyle} />
        ) : (
          <div style={placeholderStyle} aria-hidden="true">
            {data.event.title.trim().charAt(0).toUpperCase()}
          </div>
        )}

        <p style={eyebrowStyle}>Seu ingresso</p>
        <h1 style={titleStyle}>{data.event.title}</h1>
        <p style={mutedStyle}>{data.event.venue}</p>
        <p style={mutedStyle}>{formatDate(data.event.startsAt)}</p>

        {data.seatLabel ? (
          <p style={mutedStyle}>Assento {data.seatLabel}</p>
        ) : (
          <p style={mutedStyle}>Ingresso geral</p>
        )}

        {data.status === 'ISSUED' ? (
          <p style={validStyle}>✓ Ingresso válido</p>
        ) : (
          <p style={usedStyle}>
            ✗ Ingresso já utilizado
            {data.usedAt ? ` em ${formatDate(data.usedAt)}` : ''}
          </p>
        )}

        <div style={ctaAreaStyle}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleCopyLink()}
          >
            {copyState === 'ok' ? '✓ Link copiado' : 'Copiar link'}
          </button>
          {copyState === 'err' ? (
            <p style={{ ...ctaFeedbackStyle, color: 'var(--color-error)' }}>
              ✗ Falha ao copiar
            </p>
          ) : null}
          <a className="btn btn-primary" href="/gate">
            Abrir
          </a>
        </div>
      </article>
    );
  }, [share.isLoading, share.isError, share.error, share.data, copyState, handleCopyLink]);

  return (
    <section className="app-page" style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 420 }}>{content}</div>
    </section>
  );
}
