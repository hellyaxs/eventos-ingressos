import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { apiFetch } from '../lib/api';
import { restoreSession } from '../lib/auth';
import { pagePath, type PaginatedResponse } from '../lib/pagination';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { useMe } from '../lib/use-me';

type CatalogMovie = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
};

type CatalogPage = PaginatedResponse<CatalogMovie> & {
  results?: CatalogMovie[];
};

type CatalogTab = 'now-playing' | 'upcoming';

const CATALOG_SEARCH_MIN_CHARS = 3;
const CATALOG_SEARCH_DEBOUNCE_MS = 400;

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  posterUrl: string | null;
  venue: string;
  startsAt: string;
  priceCents: number;
  capacity: number;
  saleMode: 'SEAT_MAP' | 'GA_QTY';
  status?: string;
  rows?: number;
  cols?: number;
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

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.375rem',
  color: 'var(--color-secondary)',
  fontSize: '0.85rem',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  fontSize: '0.95rem',
  font: 'inherit',
  color: 'var(--color-fg)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};

const buttonStyle: CSSProperties = {
  padding: '0.7rem 1rem',
  font: 'inherit',
  fontWeight: 600,
  color: 'var(--color-bg)',
  background: 'var(--color-fg)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};

const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.6,
  cursor: 'not-allowed',
};

const buttonSecondaryStyle: CSSProperties = {
  ...buttonStyle,
  color: 'var(--color-fg)',
  background: 'transparent',
  border: '1px solid var(--color-border)',
};

const buttonSelectedStyle: CSSProperties = {
  ...buttonSecondaryStyle,
  borderColor: 'var(--color-accent)',
  color: 'var(--color-accent)',
};

const tabListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  margin: '1.25rem 0 0.75rem',
};

const SALE_MODE_LABEL: Record<'SEAT_MAP' | 'GA_QTY', string> = {
  SEAT_MAP: 'Mapa de assentos',
  GA_QTY: 'Entrada geral',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReleaseDate(value: string | null): string {
  if (!value) return 'Data a confirmar';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const posterStyle: CSSProperties = {
  width: '100%',
  aspectRatio: '2 / 3',
  objectFit: 'cover',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)',
  display: 'block',
};

const placeholderStyle: CSSProperties = {
  width: '100%',
  aspectRatio: '2 / 3',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-secondary)',
  fontSize: '2.5rem',
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: '0.85rem',
};

const strongStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--color-fg)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const statusStyle: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-fg)',
};

const sectionTitleStyle: CSSProperties = {
  margin: '2rem 0 0.75rem',
  color: 'var(--color-fg)',
  fontSize: '1.25rem',
};

const listStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  marginTop: '0.5rem',
};

const eventRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.9rem 1rem',
};

const eventRowSelectedStyle: CSSProperties = {
  ...eventRowStyle,
  borderColor: 'var(--color-accent)',
};

const eventInfoStyle: CSSProperties = {
  minWidth: 0,
};

const eventTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--color-fg)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const eventThumbStyle: CSSProperties = {
  width: '3rem',
  height: '4.5rem',
  objectFit: 'cover',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)',
  flexShrink: 0,
};

const formStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  maxWidth: '34rem',
};

const fieldRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1rem',
};

const helperStyle: CSSProperties = {
  margin: '0.5rem 0 0',
  color: 'var(--color-secondary)',
  fontSize: '0.85rem',
};

function catalogPath(
  tab: CatalogTab,
  searchQuery: string,
  page: number,
): string {
  if (searchQuery.length >= CATALOG_SEARCH_MIN_CHARS) {
    return pagePath('/api/catalog/search', page, { q: searchQuery });
  }
  const segment = tab === 'upcoming' ? 'upcoming' : 'now-playing';
  return pagePath(`/api/catalog/${segment}`, page);
}

export const Route = createFileRoute('/org')({
  beforeLoad: async () => {
    if (!(await restoreSession())) {
      throw redirect({ to: '/login' });
    }
  },
  component: OrganizerPage,
});

function OrganizerPage() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <section className="app-page app-page-wide" style={pageStyle}>
        <p className="eyebrow">Plataforma de eventos</p>
        <h1 style={titleStyle}>Administrar eventos</h1>
        <p className="status spinner" style={statusStyle}>
          Carregando perfil…
        </p>
      </section>
    );
  }

  if (me.isError || !me.data) {
    return (
      <section className="app-page app-page-wide" style={pageStyle}>
        <p className="eyebrow">Plataforma de eventos</p>
        <h1 style={titleStyle}>Administrar eventos</h1>
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          Sessão inválida ou expirada.
        </p>
      </section>
    );
  }

  if (me.data.role !== 'ORGANIZER') {
    return (
      <section className="app-page app-page-wide" style={pageStyle}>
        <p className="eyebrow">Plataforma de eventos</p>
        <h1 style={titleStyle}>Administrar eventos</h1>
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          Acesso restrito a produtores.
        </p>
      </section>
    );
  }

  return <OrganizerEventManager />;
}

function OrganizerEventManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<CatalogTab>('now-playing');
  const [selected, setSelected] = useState<CatalogMovie | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [tmdbId, setTmdbId] = useState<number | null>(null);
  const [posterUrl, setPosterUrl] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    venue: '',
    startsAt: '',
    capacity: '80',
    price: '',
    saleMode: 'SEAT_MAP' as 'SEAT_MAP' | 'GA_QTY',
    rows: '8',
    cols: '10',
  });

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogRoot, setCatalogRoot] = useState<HTMLDivElement | null>(null);

  const typedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(typedQuery, CATALOG_SEARCH_DEBOUNCE_MS);
  const searchQuery =
    debouncedQuery.length >= CATALOG_SEARCH_MIN_CHARS ? debouncedQuery : '';
  const isSearching = searchQuery.length >= CATALOG_SEARCH_MIN_CHARS;
  const waitingDebounce =
    typedQuery.length >= CATALOG_SEARCH_MIN_CHARS && typedQuery !== debouncedQuery;
  const catalogSource = isSearching ? 'search' : tab;

  const organizerEvents = useInfiniteQuery({
    queryKey: ['organizer-events'],
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<EventItem>>(pagePath('/api/events/mine', pageParam)),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    retry: false,
  });

  const catalog = useInfiniteQuery({
    queryKey: ['catalog', catalogSource, isSearching ? searchQuery : ''],
    queryFn: ({ pageParam }) =>
      apiFetch<CatalogPage>(catalogPath(tab, searchQuery, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: !editingId && !waitingDebounce,
    retry: false,
  });

  const results = useMemo(
    () => catalog.data?.pages.flatMap((page) => page.items ?? page.results ?? []) ?? [],
    [catalog.data],
  );
  const organizerItems =
    organizerEvents.data?.pages.flatMap((page) => page.items) ?? [];
  const loadMoreCatalog = useCallback(() => {
    if (catalog.hasNextPage && !catalog.isFetchingNextPage) {
      void catalog.fetchNextPage();
    }
  }, [catalog]);
  const loadMoreEvents = useCallback(() => {
    if (organizerEvents.hasNextPage && !organizerEvents.isFetchingNextPage) {
      void organizerEvents.fetchNextPage();
    }
  }, [organizerEvents]);

  const canCreate = tmdbId != null && tmdbId > 0 && posterUrl.startsWith('https://');

  function selectMovie(movie: CatalogMovie) {
    setSelected(movie);
    setTmdbId(movie.id);
    setPosterUrl(movie.poster_path ?? '');
    setForm((prev) => ({ ...prev, title: movie.title }));
    setError(null);
    requestAnimationFrame(() => {
      document.getElementById('org-venue')?.focus();
    });
  }

  function clearSelectedMovie() {
    setSelected(null);
    setTmdbId(null);
    setPosterUrl('');
    setForm((prev) => ({ ...prev, title: '' }));
  }

  function resetForm() {
    setForm({
      title: '',
      description: '',
      venue: '',
      startsAt: '',
      capacity: '80',
      price: '',
      saleMode: 'SEAT_MAP',
      rows: '8',
      cols: '10',
    });
    setSelected(null);
    setTmdbId(null);
    setPosterUrl('');
    setEditingId(null);
    setMessage('');
    setError(null);
  }

  function startEdit(event: EventItem) {
    setSelected(null);
    setTmdbId(null);
    setPosterUrl('');
    setEditingId(event.id);
    setMessage('');
    setError(null);
    setForm({
      title: event.title,
      description: event.description ?? '',
      venue: event.venue,
      startsAt: toLocalInput(event.startsAt),
      capacity: String(event.capacity),
      price: (event.priceCents / 100).toFixed(2).replace('.', ','),
      saleMode: event.saleMode,
      rows: String(event.rows ?? 8),
      cols: String(event.cols ?? 10),
    });
    requestAnimationFrame(() => {
      document.getElementById('event-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function setField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!editingId && !canCreate) {
      setError('Selecione um filme de lançamento');
      return;
    }

    setCreating(true);
    try {
      const priceCents = Math.round((parseFloat(form.price.replace(',', '.')) || 0) * 100);
      const capacity = Number.parseInt(form.capacity, 10);
      const rows = form.saleMode === 'SEAT_MAP' ? Number.parseInt(form.rows, 10) : undefined;
      const cols = form.saleMode === 'SEAT_MAP' ? Number.parseInt(form.cols, 10) : undefined;
      const startsAt = new Date(form.startsAt).toISOString();
      const description = form.description.trim() || undefined;

      if (editingId) {
        await apiFetch(`/api/events/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: form.title,
            description,
            venue: form.venue,
            startsAt,
            capacity,
            priceCents,
            saleMode: form.saleMode,
            rows,
            cols,
          }),
        });

        await queryClient.invalidateQueries({ queryKey: ['organizer-events'] });
        resetForm();
        setMessage('Alterações salvas.');
      } else {
        const created = await apiFetch<EventItem>('/api/events', {
          method: 'POST',
          body: JSON.stringify({
            title: form.title,
            description,
            venue: form.venue,
            startsAt,
            capacity,
            priceCents,
            saleMode: form.saleMode,
            rows,
            cols,
            tmdbId,
            posterUrl,
          }),
        });

        await apiFetch(`/api/events/${created.id}/publish`, {
          method: 'POST',
        });

        void navigate({ to: '/events' });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const createDisabled = creating || (!editingId && !canCreate);
  const catalogSentinelDisabled =
    !catalog.hasNextPage ||
    catalog.isFetchingNextPage ||
    selected != null ||
    Boolean(editingId);

  return (
    <section className="app-page app-page-wide" style={pageStyle}>
      <p className="eyebrow">Plataforma de eventos</p>
      <h1 style={titleStyle}>Administrar eventos</h1>
      <p className="lede">
        Escolha o filme e preencha a sessão ao lado.
      </p>

      <div className="org-workspace">
        {!editingId ? (
          <section className="org-pane" aria-labelledby="org-catalog-heading">
            <h2 id="org-catalog-heading" className="org-pane-title">
              1. Filme
            </h2>
            <div
              ref={setCatalogRoot}
              className={selected ? 'org-catalog-pane is-compact' : 'org-catalog-pane'}
            >
              {selected ? (
                <>
                  <div className="tmdb-grid">
                    <button
                      type="button"
                      className="tmdb-card is-selected"
                      aria-pressed={true}
                      onClick={() => selectMovie(selected)}
                    >
                      {selected.poster_path ? (
                        <img
                          src={selected.poster_path}
                          alt={`Cartaz de ${selected.title}`}
                          style={posterStyle}
                        />
                      ) : (
                        <div style={placeholderStyle} aria-hidden="true">
                          {selected.title.trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <h2 style={strongStyle}>{selected.title}</h2>
                      <p style={mutedStyle}>{formatReleaseDate(selected.release_date)}</p>
                    </button>
                  </div>
                  <div className="org-compact-actions">
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={clearSelectedMovie}
                    >
                      Trocar filme
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div role="tablist" aria-label="Catálogo de lançamentos" style={tabListStyle}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'now-playing'}
                      style={tab === 'now-playing' && !isSearching ? buttonSelectedStyle : buttonSecondaryStyle}
                      onClick={() => setTab('now-playing')}
                    >
                      Em cartaz
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'upcoming'}
                      style={tab === 'upcoming' && !isSearching ? buttonSelectedStyle : buttonSecondaryStyle}
                      onClick={() => setTab('upcoming')}
                    >
                      Em breve
                    </button>
                  </div>

                  <div style={{ ...formStyle, marginTop: 0 }}>
                    <div>
                      <label htmlFor="org-search" style={labelStyle}>
                        Buscar filme no catálogo
                      </label>
                      <input
                        id="org-search"
                        type="search"
                        placeholder="Digite pelo menos 3 letras (ex.: Homem)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {typedQuery.length > 0 && typedQuery.length < CATALOG_SEARCH_MIN_CHARS ? (
                    <p style={helperStyle}>
                      Digite pelo menos {CATALOG_SEARCH_MIN_CHARS} caracteres para buscar.
                    </p>
                  ) : isSearching ? (
                    <p style={helperStyle}>Resultados da busca. Limpe o campo para voltar à vitrine.</p>
                  ) : null}

                  {catalog.isLoading || waitingDebounce ? (
                    <p className="status spinner" style={statusStyle}>
                      Carregando catálogo…
                    </p>
                  ) : catalog.isError ? (
                    <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
                      Não foi possível carregar o catálogo.
                    </p>
                  ) : results.length === 0 ? (
                    <p className="status" style={statusStyle}>
                      {isSearching ? 'Nenhum filme encontrado.' : 'Nenhum lançamento disponível.'}
                    </p>
                  ) : (
                    <>
                      <div className="tmdb-grid">
                        {results.map((movie) => (
                          <button
                            type="button"
                            key={movie.id}
                            className="tmdb-card"
                            aria-pressed={false}
                            onClick={() => selectMovie(movie)}
                          >
                            {movie.poster_path ? (
                              <img
                                src={movie.poster_path}
                                alt={`Cartaz de ${movie.title}`}
                                style={posterStyle}
                              />
                            ) : (
                              <div style={placeholderStyle} aria-hidden="true">
                                {movie.title.trim().charAt(0).toUpperCase()}
                              </div>
                            )}
                            <h2 style={strongStyle}>{movie.title}</h2>
                            <p style={mutedStyle}>{formatReleaseDate(movie.release_date)}</p>
                          </button>
                        ))}
                      </div>
                      <InfiniteSentinel
                        onVisible={loadMoreCatalog}
                        disabled={catalogSentinelDisabled}
                        root={catalogRoot}
                        rootMargin="120px 0px"
                      />
                      {catalog.isFetchingNextPage ? (
                        <p className="status spinner" style={statusStyle}>
                          Carregando mais filmes…
                        </p>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        ) : null}

        <section className="org-pane" aria-labelledby="org-session-heading">
          <h2 id="org-session-heading" className="org-pane-title">
            2. Sessão
          </h2>
          <div className="org-session-pane">
            {selected ? (
              <div className="org-selected-film">
                {selected.poster_path ? (
                  <img
                    className="org-selected-poster"
                    src={selected.poster_path}
                    alt={`Cartaz de ${selected.title}`}
                  />
                ) : (
                  <div className="org-selected-poster-fallback" aria-hidden="true">
                    {selected.title.trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="org-selected-meta">
                  <strong style={strongStyle}>Sessão de {selected.title}</strong>
                  <p style={mutedStyle}>TMDb #{selected.id}</p>
                </div>
              </div>
            ) : !editingId ? (
              <p className="org-selected-empty">Selecione um filme no catálogo</p>
            ) : null}

            {message ? (
              <p className="status" style={{ ...statusStyle, color: 'var(--color-success)' }}>
                {message}
              </p>
            ) : null}

            <form
              id="event-form"
              onSubmit={handleSubmit}
              style={{ ...formStyle, marginTop: '0.5rem' }}
              noValidate
            >
        <input type="hidden" name="tmdbId" value={tmdbId ?? ''} readOnly />
        <input type="hidden" name="posterUrl" value={posterUrl} readOnly />

        <div>
          <label htmlFor="org-title" style={labelStyle}>
            Título
          </label>
          <input
            id="org-title"
            type="text"
            maxLength={200}
            placeholder="Nome do evento"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label htmlFor="org-description" style={labelStyle}>
            Descrição
          </label>
          <textarea
            id="org-description"
            maxLength={2000}
            rows={3}
            placeholder="Detalhes do evento (opcional)"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '5rem' }}
          />
        </div>

        <div>
          <label htmlFor="org-venue" style={labelStyle}>
            Local
          </label>
          <input
            id="org-venue"
            type="text"
            maxLength={200}
            placeholder="Arena Demo"
            value={form.venue}
            onChange={(e) => setField('venue', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label htmlFor="org-starts" style={labelStyle}>
            Data e hora de início
          </label>
          <input
            id="org-starts"
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setField('startsAt', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div style={fieldRowStyle}>
          <div>
            <label htmlFor="org-capacity" style={labelStyle}>
              Capacidade
            </label>
            <input
              id="org-capacity"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setField('capacity', e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label htmlFor="org-price" style={labelStyle}>
              Preço (R$)
            </label>
            <input
              id="org-price"
              type="text"
              inputMode="decimal"
              placeholder="100,00"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              style={inputStyle}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="org-sale-mode" style={labelStyle}>
            Modo de venda
          </label>
          <select
            id="org-sale-mode"
            value={form.saleMode}
            onChange={(e) =>
              setField('saleMode', e.target.value as 'SEAT_MAP' | 'GA_QTY')
            }
            style={inputStyle}
          >
            <option value="SEAT_MAP">Mapa de assentos</option>
            <option value="GA_QTY">Entrada geral</option>
          </select>
        </div>

        {form.saleMode === 'SEAT_MAP' ? (
          <div style={fieldRowStyle}>
            <div>
              <label htmlFor="org-rows" style={labelStyle}>
                Linhas
              </label>
              <input
                id="org-rows"
                type="number"
                min={1}
                max={26}
                value={form.rows}
                onChange={(e) => setField('rows', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label htmlFor="org-cols" style={labelStyle}>
                Colunas
              </label>
              <input
                id="org-cols"
                type="number"
                min={1}
                value={form.cols}
                onChange={(e) => setField('cols', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          style={createDisabled ? buttonDisabledStyle : buttonStyle}
          disabled={createDisabled}
        >
          {creating
            ? editingId
              ? 'Salvando…'
              : 'Criando e publicando…'
            : editingId
              ? 'Salvar alterações'
              : 'Criar e publicar evento'}
        </button>

        {!editingId && !canCreate ? (
          <p style={helperStyle}>Selecione um filme de lançamento</p>
        ) : null}
      </form>
          </div>
        </section>
      </div>

      {editingId ? (
        <button
          type="button"
          style={creating ? buttonDisabledStyle : buttonSecondaryStyle}
          onClick={resetForm}
          disabled={creating}
        >
          Cancelar edição
        </button>
      ) : null}

      <h2 style={sectionTitleStyle}>Meus eventos</h2>

      {organizerEvents.isLoading ? (
        <p className="status spinner" style={statusStyle}>
          Carregando eventos…
        </p>
      ) : organizerEvents.isError ? (
        <p className="status" style={{ ...statusStyle, color: 'var(--color-error)' }}>
          Não foi possível carregar seus eventos.
        </p>
      ) : organizerItems.length === 0 ? (
        <p className="status" style={statusStyle}>
          Nenhum evento criado ainda. Crie o primeiro acima.
        </p>
      ) : (
        <>
          <div style={listStyle}>
            {organizerItems.map((event) => {
              const editing = editingId === event.id;
              return (
                <article
                  key={event.id}
                  style={editing ? eventRowSelectedStyle : eventRowStyle}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    {event.posterUrl ? (
                      <img
                        src={event.posterUrl}
                        alt={`Cartaz de ${event.title}`}
                        style={eventThumbStyle}
                      />
                    ) : null}
                    <div style={eventInfoStyle}>
                      <h3 style={eventTitleStyle}>{event.title}</h3>
                      <p style={mutedStyle}>
                        {event.venue} · {formatDate(event.startsAt)}
                      </p>
                      <p style={mutedStyle}>
                        {event.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'} ·{' '}
                        {SALE_MODE_LABEL[event.saleMode]}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={editing ? buttonSelectedStyle : buttonSecondaryStyle}
                    onClick={() => (editing ? resetForm() : startEdit(event))}
                  >
                    {editing ? 'Editando…' : 'Editar'}
                  </button>
                </article>
              );
            })}
          </div>
          <InfiniteSentinel
            onVisible={loadMoreEvents}
            disabled={!organizerEvents.hasNextPage || organizerEvents.isFetchingNextPage}
          />
        </>
      )}
    </section>
  );
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
