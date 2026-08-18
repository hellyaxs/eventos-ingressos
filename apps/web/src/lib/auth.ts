import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';

export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  avatar: string | null;
};

const SESSION_SENTINEL = 'cena-session-active';

let sessionActive = false;
let restorePromise: Promise<boolean> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function watch(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function getToken(): string | null {
  return sessionActive ? SESSION_SENTINEL : null;
}

export function setToken(_token?: string) {
  void _token;
  sessionActive = true;
  restorePromise = Promise.resolve(true);
  notify();
}

export function clearToken() {
  sessionActive = false;
  restorePromise = Promise.resolve(false);
  notify();
  void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

export function useToken(): string | null {
  return useSyncExternalStore(watch, getToken);
}

export async function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/api/auth/me');
}

/** Lê o cookie httpOnly via GET /auth/me. Idempotente entre rotas no mesmo load. */
export function restoreSession(): Promise<boolean> {
  if (restorePromise) return restorePromise;
  restorePromise = fetchMe()
    .then(() => {
      sessionActive = true;
      notify();
      return true;
    })
    .catch(() => {
      sessionActive = false;
      notify();
      void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      return false;
    });
  return restorePromise;
}
