import { useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { apiFetch } from '../lib/api';
import { setToken, type AuthUser } from '../lib/auth';
import { queryClient } from '../lib/query-client';

type LoginResponse = {
  user: AuthUser;
};

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      if (res.user.role === 'ORGANIZER') {
        await navigate({ to: '/org' });
      } else if (res.user.role === 'GATE') {
        await navigate({ to: '/gate' });
      } else {
        await navigate({ to: '/events' });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login">
      <p className="eyebrow">Plataforma de eventos</p>
      <h1>Entrar</h1>
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-field">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="voce@exemplo.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </div>
        <div className="login-field">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            required
          />
        </div>
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="login-submit" type="submit" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="login-hint">
        Demonstração: <code>org@eventos.local</code> · <code>cliente1@eventos.local</code> ·{' '}
        <code>gate@eventos.local</code> — todas com senha <code>secret123</code>.
      </p>
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