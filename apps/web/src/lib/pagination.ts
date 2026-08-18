export const PAGE_SIZE = 12;

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function pagePath(
  path: string,
  page: number,
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `${path}?${params.toString()}`;
}
