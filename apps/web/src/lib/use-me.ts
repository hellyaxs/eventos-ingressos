import { useQuery } from '@tanstack/react-query';
import { fetchMe, useToken, type AuthUser } from './auth';

export function useMe() {
  const token = useToken() ?? '';

  return useQuery<AuthUser>({
    queryKey: ['me'],
    queryFn: () => fetchMe(),
    enabled: token.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
