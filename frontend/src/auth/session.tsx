import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, onForbidden, onSessionExpired, refreshAccessToken, setAccessToken } from '../lib/api';
import type { Profile } from '../lib/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface Session {
  status: Status;
  /** True after a voluntary logout: the next login should not return to the previous page. */
  loggedOut: boolean;
  me: Profile | null;
  can: (permission: string) => boolean;
  canAll: (permissions: string[]) => boolean;
  canAny: (permissions: string[]) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<unknown>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [loggedOut, setLoggedOut] = useState(false);

  // Restores the session from the refresh cookie on page load.
  useEffect(() => {
    let cancelled = false;
    refreshAccessToken().then((ok) => {
      if (!cancelled) setStatus(ok ? 'authenticated' : 'anonymous');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const offExpired = onSessionExpired(() => {
      setStatus((current) => {
        if (current === 'authenticated') toast.error('Session terminée : veuillez vous reconnecter.');
        return 'anonymous';
      });
      queryClient.clear();
    });
    // A 403 may mean that our permissions changed: reload them.
    const offForbidden = onForbidden(() => queryClient.invalidateQueries({ queryKey: ['me'] }));
    return () => {
      offExpired();
      offForbidden();
    };
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Profile>('/auth/me'),
    enabled: status === 'authenticated',
    refetchInterval: 30_000,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setAccessToken(accessToken);
      queryClient.clear();
      setLoggedOut(false);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      queryClient.clear();
      setLoggedOut(true);
      setStatus('anonymous');
    }
  }, [queryClient]);

  const value = useMemo<Session>(() => {
    const me = status === 'authenticated' ? (meQuery.data ?? null) : null;
    const granted = new Set(me?.permissions ?? []);
    const can = (permission: string) => granted.has(permission);
    return {
      status: status === 'authenticated' && !me ? 'loading' : status,
      loggedOut,
      me,
      can,
      canAll: (permissions) => permissions.every(can),
      canAny: (permissions) => permissions.some(can),
      login,
      logout,
      reloadMe: () => meQuery.refetch(),
    };
  }, [status, loggedOut, meQuery, login, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

/** Shortcut for pages that are only rendered once authenticated. */
export function useMe(): Profile {
  const { me } = useSession();
  if (!me) throw new Error('Not authenticated');
  return me;
}
