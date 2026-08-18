import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { clearToken, fetchMe, getToken, restoreSession, type AuthUser } from '../lib/auth';
import { queryClient } from '../lib/query-client';

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    if (!(await restoreSession())) {
      throw redirect({ to: '/login' });
    }
  },
  component: DashboardPage,
});

const ROLE_LABEL: Record<string, string> = {
  ORGANIZER: 'Produtor',
  CLIENT: 'Participante',
  GATE: 'Portaria',
};

function DashboardPage() {
  const navigate = useNavigate();
  const token = getToken() ?? '';

  const me = useQuery<AuthUser>({
    queryKey: ['me'],
    queryFn: () => fetchMe(),
    enabled: token.length > 0,
    retry: false,
  });

  function handleLogout() {
    clearToken();
    queryClient.removeQueries({ queryKey: ['me'] });
    void navigate({ to: '/' });
  }

  if (me.isLoading) {
    return (
      <section className="app-page">
        <p className="eyebrow">Plataforma de eventos</p>
        <h1>Conta</h1>
        <p className="status spinner">Carregando perfil…</p>
      </section>
    );
  }

  if (me.isError || !me.data) {
    return (
      <section className="app-page">
        <p className="eyebrow">Plataforma de eventos</p>
        <h1>Conta</h1>
        <p className="status" data-state="error">
          Sessão inválida ou expirada.
        </p>
        <button type="button" className="login-submit" onClick={handleLogout}>
          Sair e voltar ao início
        </button>
      </section>
    );
  }

  const user = me.data;
  const initials =
    user.name?.trim().split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase() ??
    user.email[0].toUpperCase();

  return (
    <section className="app-page">
      <p className="eyebrow">Plataforma de eventos</p>
      <h1>Conta</h1>
      <article className="profile-card">
        <div className="profile-avatar" aria-hidden="true">
          {user.avatar ? <img src={user.avatar} alt="" /> : initials}
        </div>
        <div className="profile-meta">
          <p className="profile-name">{user.name ?? 'Sem nome'}</p>
          <p className="profile-email">{user.email}</p>
        </div>
        <span className="role-chip" data-role={user.role}>
          {ROLE_LABEL[user.role] ?? user.role}
        </span>
      </article>
      <p className="login-hint">
        Sessão ativa com cookie seguro. Use <code>Sair</code> para encerrar.
      </p>
    </section>
  );
}