import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PageQueryDto,
  resolvePage,
  toPaginatedResponse,
} from '../common/pagination';

export type CatalogMovie = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
};

export type CatalogSearchResult = {
  items: CatalogMovie[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  results: CatalogMovie[];
};

type TmdbMovie = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
};

type TmdbListResponse = {
  page?: number;
  total_results?: number;
  total_pages?: number;
  results?: TmdbMovie[];
};

const TMDB_HOST = 'https://api.themoviedb.org';
const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const REQUEST_TIMEOUT_MS = 4000;

const FALLBACK_MOVIES: CatalogMovie[] = [
  {
    id: 155,
    title: 'The Dark Knight',
    poster_path: 'https://picsum.photos/seed/dark-knight/500/750',
    release_date: '2008-07-16',
  },
  {
    id: 27205,
    title: 'Inception',
    poster_path: 'https://picsum.photos/seed/inception/500/750',
    release_date: '2010-07-15',
  },
  {
    id: 157336,
    title: 'Interstellar',
    poster_path: 'https://picsum.photos/seed/interstellar/500/750',
    release_date: '2014-11-05',
  },
  {
    id: 603,
    title: 'The Matrix',
    poster_path: 'https://picsum.photos/seed/the-matrix/500/750',
    release_date: '1999-03-30',
  },
  {
    id: 680,
    title: 'Pulp Fiction',
    poster_path: 'https://picsum.photos/seed/pulp-fiction/500/750',
    release_date: '1994-09-10',
  },
  {
    id: 634649,
    title: 'Homem-Aranha: Sem Volta para Casa',
    poster_path: 'https://picsum.photos/seed/homem-aranha/500/750',
    release_date: '2021-12-16',
  },
  {
    id: 1726,
    title: 'Homem de Ferro',
    poster_path: 'https://picsum.photos/seed/homem-de-ferro/500/750',
    release_date: '2008-05-02',
  },
];

function mapMovie(movie: TmdbMovie): CatalogMovie {
  return {
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path
      ? `${POSTER_BASE_URL}${movie.poster_path}`
      : null,
    release_date: movie.release_date,
  };
}

function paginateFallback(
  items: CatalogMovie[],
  page: number,
  limit: number,
) {
  const start = (page - 1) * limit;
  return toPaginatedResponse({
    items: items.slice(start, start + limit),
    page,
    limit,
    total: items.length,
  });
}

function filterFallback(query?: string): CatalogMovie[] {
  const needle = query?.trim().toLowerCase();
  if (!needle) return FALLBACK_MOVIES;
  return FALLBACK_MOVIES.filter((movie) =>
    movie.title.toLowerCase().includes(needle),
  );
}

function isTmdbReadAccessToken(credential: string): boolean {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
    credential,
  );
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly config: ConfigService) {}

  async search(query: string, pageQuery: PageQueryDto): Promise<CatalogSearchResult> {
    const q = query.trim();
    const { page, limit } = resolvePage(pageQuery);

    if (!q) {
      return this.emptyResult(page, limit);
    }

    return this.fetchCatalog(
      '/3/search/movie',
      page,
      limit,
      { query: q, language: 'pt-BR', include_adult: 'false' },
      { searchQuery: q },
    );
  }

  async nowPlaying(pageQuery: PageQueryDto): Promise<CatalogSearchResult> {
    const { page, limit } = resolvePage(pageQuery);
    return this.fetchCatalog('/3/movie/now_playing', page, limit, {
      language: 'pt-BR',
    });
  }

  async upcoming(pageQuery: PageQueryDto): Promise<CatalogSearchResult> {
    const { page, limit } = resolvePage(pageQuery);
    return this.fetchCatalog('/3/movie/upcoming', page, limit, {
      language: 'pt-BR',
    });
  }

  /** Mesmo padrão do cliente Angular: `Authorization: Bearer ${TMDB_API_KEY}`. */
  private getHeaders(credential: string): Record<string, string> {
    if (isTmdbReadAccessToken(credential)) {
      return {
        accept: 'application/json',
        Authorization: `Bearer ${credential}`,
      };
    }
    return { accept: 'application/json' };
  }

  private tmdbHost(): string {
    const configured = this.config.get<string>('TMDB_BASE_URL')?.trim();
    if (!configured) return TMDB_HOST;
    return configured.replace(/\/$/, '').replace(/\/3$/, '') || TMDB_HOST;
  }

  private emptyResult(page: number, limit: number): CatalogSearchResult {
    const paged = toPaginatedResponse({
      items: [],
      page,
      limit,
      total: 0,
    });
    return { ...paged, results: paged.items };
  }

  private fallbackResult(
    page: number,
    limit: number,
    searchQuery?: string,
  ): CatalogSearchResult {
    const paged = paginateFallback(filterFallback(searchQuery), page, limit);
    return { ...paged, results: paged.items };
  }

  private async fetchCatalog(
    pathname: string,
    page: number,
    limit: number,
    extraQuery: Record<string, string> = {},
    options: { searchQuery?: string } = {},
  ): Promise<CatalogSearchResult> {
    const apiKey = this.config.get<string>('TMDB_API_KEY')?.trim();
    const host = this.tmdbHost();

    if (!apiKey) {
      this.logger.warn(
        'TMDB_API_KEY is not configured; using fallback fixtures',
      );
      return this.fallbackResult(page, limit, options.searchQuery);
    }

    try {
      const params = new URLSearchParams({
        ...extraQuery,
        page: String(page),
      });
      if (!isTmdbReadAccessToken(apiKey)) {
        params.set('api_key', apiKey);
      }

      const url = `${host}${pathname}?${params.toString()}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: this.getHeaders(apiKey),
      });

      if (!response.ok) {
        this.logger.warn(
          `TMDB responded with status ${response.status}; using fallback fixtures`,
        );
        return this.fallbackResult(page, limit, options.searchQuery);
      }

      const data = (await response.json()) as TmdbListResponse;
      const normalized = data.results?.map(mapMovie) ?? [];
      const results = normalized.slice(0, limit);
      const total = data.total_results ?? normalized.length;

      if (results.length === 0) {
        if (options.searchQuery) {
          return this.emptyResult(page, limit);
        }
        return this.fallbackResult(page, limit);
      }

      const paged = toPaginatedResponse({
        items: results,
        page,
        limit,
        total,
      });
      return { ...paged, results: paged.items };
    } catch (error) {
      this.logger.warn(
        `TMDB request failed; using fallback fixtures: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return this.fallbackResult(page, limit, options.searchQuery);
    }
  }
}
