import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  agencyName: string;
  role: string;
  createdAt: string;
}

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "pf_auth_token";
const USER_KEY = "pf_auth_user";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Re-fetches the current user (including role) from the server so a stale
// cached copy in localStorage never keeps admin-only UI hidden after a role
// change. Best-effort: on failure it silently keeps the cached user as-is.
async function fetchFreshUser(token: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as UserProfile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoading: true });

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      let cachedUser: UserProfile | null = null;
      try {
        cachedUser = JSON.parse(storedUser) as UserProfile;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState({ user: null, token: null, isLoading: false });
        return;
      }

      // Always fetch a fresh user from the server before clearing isLoading so
      // that role-gated UI (e.g. the "Delete All Schedules" admin button) is
      // evaluated against authoritative server data, not a potentially stale
      // localStorage snapshot.  Fall back to the cached user only when the
      // request fails (network error, expired token, etc.).
      fetchFreshUser(storedToken).then((freshUser) => {
        const userToUse = freshUser ?? cachedUser!;
        if (freshUser) {
          localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
        }
        setState({ user: userToUse, token: storedToken, isLoading: false });
      });
    } else {
      setState({ user: null, token: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
    return () => setAuthTokenGetter(null);
  }, []);

  const login = useCallback((token: string, user: UserProfile) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ user, token, isLoading: false });

    // Re-fetch immediately after login too, in case the login response's
    // user snapshot is ever out of date relative to the server.
    fetchFreshUser(token).then((freshUser) => {
      if (freshUser) {
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
        setState((prev) => (prev.token === token ? { ...prev, user: freshUser } : prev));
      }
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setState({ user: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        isAuthenticated: !!state.token && !!state.user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
