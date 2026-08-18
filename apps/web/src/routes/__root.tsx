import { useEffect } from 'react';
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { clearToken, restoreSession, useToken } from '../lib/auth';
import { queryClient } from '../lib/query-client';
import { useMe } from '../lib/use-me';

export const Route = createRootRoute({
  component: RootLayout,
});

const ROLE_LINKS: Record<string, Array<{ to: string; label: string }>> = {
  ORGANIZER: [
    { to: '/events', label: 'Eventos' },
    { to: '/org', label: 'Novo evento' },
  ],
  CLIENT: [
    { to: '/events', label: 'Eventos' },
    { to: '/tickets', label: 'Meus ingressos' },
  ],
  GATE: [
    { to: '/events', label: 'Eventos' },
    { to: '/gate', label: 'Portaria' },
  ],
};

function RootLayout() {
  const token = useToken();
  const me = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    void restoreSession();
  }, []);

  const links = me.data ? (ROLE_LINKS[me.data.role] ?? [{ to: '/events', label: 'Eventos' }]) : [];

  function handleLogout() {
    clearToken();
    queryClient.removeQueries({ queryKey: ['me'] });
    void navigate({ to: '/' });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand">
          Cena
        </a>
        <nav className="nav">
          {token ? (
            <>
              {links.map((link) => (
                <a key={link.to} href={link.to}>
                  {link.label}
                </a>
              ))}
              <a href="/app">Perfil</a>
              <button type="button" className="nav-link nav-link-button" onClick={handleLogout}>
                Sair
              </button>
            </>
          ) : (
            <>
              <a href="/events">Eventos</a>
              <a href="/login">Entrar</a>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
