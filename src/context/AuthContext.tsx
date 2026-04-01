import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, Organization, AuthConfig, InviteRegisterRequest } from '../types';
import { authApi } from '../services/api';
import { setOnAuthFailure } from '../services/api';
import { setTokens, clearTokens, hasTokens } from '../services/auth';

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  authConfig: AuthConfig | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (orgName: string, name: string, email: string, password: string) => Promise<void>;
  registerWithInvite: (data: InviteRegisterRequest) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;
  const mustChangePassword = !!user?.must_change_password;

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setOrganization(null);
  }, []);

  // Register auth failure callback for 401 handling in api.ts
  useEffect(() => {
    setOnAuthFailure(logout);
  }, [logout]);

  const refreshUser = useCallback(async () => {
    try {
      const { user: u, organization: org } = await authApi.me();
      setUser(u);
      setOrganization(org);
    } catch {
      clearTokens();
      setUser(null);
      setOrganization(null);
    }
  }, []);

  // Initialize: fetch auth config, then validate session
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const config = await authApi.config();
        if (cancelled) return;
        setAuthConfig(config);

        if (config.provider === 'noop') {
          // Noop mode: auto-authenticated, fetch user info
          const { user: u, organization: org } = await authApi.me();
          if (cancelled) return;
          setUser(u);
          setOrganization(org);
        } else if (hasTokens()) {
          // Has stored tokens: validate them
          try {
            const { user: u, organization: org } = await authApi.me();
            if (cancelled) return;
            setUser(u);
            setOrganization(org);
          } catch {
            if (cancelled) return;
            clearTokens();
          }
        }
      } catch {
        // Config fetch failed — fallback to noop-like behavior
        if (cancelled) return;
        setAuthConfig({ provider: 'noop', registration_enabled: false, multi_tenant: false });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setTokens(res.access_token, res.refresh_token);
    // Fetch full user + org info; if this fails, clean up tokens to avoid broken state
    try {
      const me = await authApi.me();
      setUser(me.user);
      setOrganization(me.organization);
    } catch (err) {
      clearTokens();
      throw err;
    }
  }, []);

  const register = useCallback(async (orgName: string, name: string, email: string, password: string) => {
    const res = await authApi.register({ org_name: orgName, name, email, password });
    setTokens(res.access_token, res.refresh_token);
    setUser(res.user);
    setOrganization(res.organization);
  }, []);

  const registerWithInvite = useCallback(async (data: InviteRegisterRequest) => {
    const res = await authApi.registerWithInvite(data);
    setTokens(res.access_token, res.refresh_token);
    setUser(res.user);
    setOrganization(res.organization);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        authConfig,
        isLoading,
        isAuthenticated,
        mustChangePassword,
        login,
        register,
        registerWithInvite,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
