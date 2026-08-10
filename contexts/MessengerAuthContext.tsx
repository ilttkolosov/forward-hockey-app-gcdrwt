import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MessengerSession } from "../features/messenger/types";
import {
  getMessengerMe,
  loginToMessenger,
  logoutFromMessenger,
  registerInMessenger,
} from "../services/messengerApi";
import {
  loadMessengerSession,
  saveMessengerSession,
  subscribeMessengerSession,
} from "../services/messengerSession";

type MessengerAuthStatus = "loading" | "authenticated" | "unauthenticated";

interface MessengerAuthContextValue {
  status: MessengerAuthStatus;
  session: MessengerSession | null;
  isAuthenticated: boolean;
  login(username: string, password: string): Promise<void>;
  register(payload: {
    invite_token: string;
    username: string;
    password: string;
    display_name?: string;
    email?: string;
  }): Promise<void>;
  logout(): Promise<void>;
}

const MessengerAuthContext = createContext<MessengerAuthContextValue | null>(
  null,
);

export function MessengerAuthProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<MessengerAuthStatus>("loading");
  const [session, setSession] = useState<MessengerSession | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeMessengerSession((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");
    });
    void loadMessengerSession().then(async (stored) => {
      if (!active) return;
      setSession(stored);
      setStatus(stored ? "authenticated" : "unauthenticated");
      if (!stored) return;
      try {
        const user = await getMessengerMe();
        const current = (await loadMessengerSession()) || stored;
        await saveMessengerSession({ ...current, user });
      } catch (error) {
        console.warn("[Messenger] Фоновая проверка сессии отложена:", error);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setStatus("loading");
    try {
      const authenticated = await loginToMessenger(username, password);
      setSession(authenticated);
      setStatus("authenticated");
    } catch (error) {
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const register = useCallback<MessengerAuthContextValue["register"]>(
    async (payload) => {
      setStatus("loading");
      try {
        const authenticated = await registerInMessenger(payload);
        setSession(authenticated);
        setStatus("authenticated");
      } catch (error) {
        setStatus("unauthenticated");
        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutFromMessenger();
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<MessengerAuthContextValue>(
    () => ({
      status,
      session,
      isAuthenticated: status === "authenticated" && Boolean(session),
      login,
      register,
      logout,
    }),
    [login, logout, register, session, status],
  );

  return (
    <MessengerAuthContext.Provider value={value}>
      {children}
    </MessengerAuthContext.Provider>
  );
}

export function useMessengerAuth(): MessengerAuthContextValue {
  const context = useContext(MessengerAuthContext);
  if (!context)
    throw new Error(
      "useMessengerAuth must be used inside MessengerAuthProvider",
    );
  return context;
}
