import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useMe } from '../lib/use-me';

type Health = {
  status: string;
  service: string;
  timestamp: string;
};

const ROLE_ACTIONS: Record<string, Array<{ to: string; label: string; primary?: boolean }>> = {
  ORGANIZER: [
    { to: '/org', label: 'Criar novo evento', primary: true },
    { to: '/events', label: 'Ver eventos publicados' },
  ],
  CLIENT: [
    { to: '/events', label: 'Escolher assento', primary: true },
    { to: '/tickets', label: 'Meus ingressos' },
  ],
  GATE: [
    { to: '/gate', label: 'Abrir portaria', primary: true },
    { to: '/events', label: 'Ver eventos' },
  ],
};

const GUEST_ACTIONS = [
  { to: '/events', label: 'Ver eventos', primary: true },
  { to: '/login', label: 'Entrar' },
];

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const me = useMe();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<Health>('/api/health'),
    retry: false,
  });

  const actions = me.data ? (ROLE_ACTIONS[me.data.role] ?? GUEST_ACTIONS) : GUEST_ACTIONS;

  return (
    <section className="home">
      <p className="eyebrow">Plataforma de eventos</p>
      <h1>Cena</h1>
      <p className="lede">
        Reserve o assento num mapa 3D, pague de forma simulada e valide na portaria com QR.
      </p>

      <div className="cta-row">
        {actions.map((action) => (
          <a
            key={action.to}
            href={action.to}
            className={action.primary ? 'cta cta-primary' : 'cta'}
          >
            {action.primary ? '▸ ' : ''}
            {action.label}
          </a>
        ))}
      </div>

      <p
        className={'status' + (health.isLoading ? ' spinner' : '')}
        data-state={health.isError ? 'error' : health.data ? 'ok' : undefined}
      >
        API:{' '}
        {health.isLoading
          ? 'conectando…'
          : health.isError
            ? 'offline (suba `pnpm --filter @eventos/api dev` + Redis)'
            : `${health.data?.service} · ${health.data?.status}`}
      </p>
    </section>
  );
}
