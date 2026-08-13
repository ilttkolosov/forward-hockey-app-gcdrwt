import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "expo-router";
import { AppState } from "react-native";
import type {
  MessengerPasswordChangeRequired,
  MessengerSession,
} from "../features/messenger/types";
import {
  completeMessengerPasswordChange,
  getMessengerMe,
  loginToMessenger,
  logoutFromMessenger,
  registerInMessenger,
} from "../services/messengerApi";
import {
  clearMessengerPasswordChange,
  loadMessengerSession,
  loadMessengerPasswordChange,
  saveMessengerSession,
  subscribeMessengerSession,
} from "../services/messengerSession";
import {
  connectMessengerRealtime,
  disconnectMessengerRealtime,
  resumeMessengerRealtime,
  setMessengerPresenceActive,
} from "../services/messengerRealtime";
import { cancelAllManagedMessengerMediaUploads } from "../services/messengerMediaUploadManager";

type MessengerAuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "password_change_required";

interface MessengerAuthContextValue {
  status: MessengerAuthStatus;
  session: MessengerSession | null;
  passwordChange: MessengerPasswordChangeRequired | null;
  isAuthenticated: boolean;
  login(
    username: string,
    password: string,
  ): Promise<"authenticated" | "password_change_required">;
  register(payload: {
    invite_token: string;
    username: string;
    password: string;
    display_name?: string;
    email?: string;
  }): Promise<void>;
  completePasswordChange(
    password: string,
    passwordConfirmation: string,
  ): Promise<void>;
  cancelPasswordChange(): Promise<void>;
  refreshUser(): Promise<void>;
  logout(): Promise<void>;
}

const MessengerAuthContext = createContext<MessengerAuthContextValue | null>(
  null,
);

export function MessengerAuthProvider({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const [status, setStatus] = useState<MessengerAuthStatus>("loading");
  const [session, setSession] = useState<MessengerSession | null>(null);
  const [passwordChange, setPasswordChange] =
    useState<MessengerPasswordChangeRequired | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeMessengerSession((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        setPasswordChange(null);
        setStatus("authenticated");
      } else {
        setStatus((current) =>
          current === "password_change_required" ? current : "unauthenticated",
        );
      }
    });
    void Promise.all([
      loadMessengerSession(),
      loadMessengerPasswordChange(),
    ]).then(async ([stored, pendingPasswordChange]) => {
      if (!active) return;
      setSession(stored);
      if (stored) {
        setPasswordChange(null);
        setStatus("authenticated");
        if (pendingPasswordChange) await clearMessengerPasswordChange();
        try {
          const user = await getMessengerMe();
          const current = (await loadMessengerSession()) || stored;
          await saveMessengerSession({ ...current, user });
        } catch (error) {
          console.warn("[Messenger] Фоновая проверка сессии отложена:", error);
        }
        return;
      }
      setPasswordChange(pendingPasswordChange);
      setStatus(
        pendingPasswordChange ? "password_change_required" : "unauthenticated",
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (accessToken) connectMessengerRealtime(accessToken);
    else {
      cancelAllManagedMessengerMediaUploads();
      disconnectMessengerRealtime();
    }
  }, [session?.access_token]);

  useEffect(() => {
    const insideCommunication =
      Boolean(session?.access_token) &&
      pathname.startsWith("/messenger") &&
      !pathname.startsWith("/messenger/register");
    setMessengerPresenceActive(insideCommunication);
  }, [pathname, session?.access_token]);

  useEffect(
    () => () => {
      setMessengerPresenceActive(false);
    },
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      // A background notification may have attempted to read iOS Keychain
      // while the phone was locked. Retry once the device is active instead
      // of treating that temporary storage denial as a logout.
      void loadMessengerSession().then((restored) => {
        if (!restored) return;
        setSession(restored);
        setPasswordChange(null);
        setStatus("authenticated");
      });
      resumeMessengerRealtime();
    });
    return () => subscription.remove();
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<"authenticated" | "password_change_required"> => {
      setStatus("loading");
      try {
        const result = await loginToMessenger(username, password);
        if ("password_change_required" in result) {
          setSession(null);
          setPasswordChange(result);
          setStatus("password_change_required");
          return "password_change_required";
        }
        setSession(result);
        setPasswordChange(null);
        setStatus("authenticated");
        return "authenticated";
      } catch (error) {
        setStatus("unauthenticated");
        throw error;
      }
    },
    [],
  );

  const register = useCallback<MessengerAuthContextValue["register"]>(
    async (payload) => {
      setStatus("loading");
      try {
        const authenticated = await registerInMessenger(payload);
        setSession(authenticated);
        setPasswordChange(null);
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
    setPasswordChange(null);
    setStatus("unauthenticated");
  }, []);

  const completePasswordChange = useCallback(
    async (password: string, passwordConfirmation: string) => {
      if (!passwordChange) throw new Error("Сеанс смены пароля не найден");
      setStatus("loading");
      try {
        const authenticated = await completeMessengerPasswordChange(
          passwordChange.change_token,
          password,
          passwordConfirmation,
        );
        setSession(authenticated);
        setPasswordChange(null);
        setStatus("authenticated");
      } catch (error) {
        setStatus("password_change_required");
        throw error;
      }
    },
    [passwordChange],
  );

  const cancelPasswordChange = useCallback(async () => {
    await clearMessengerPasswordChange();
    setPasswordChange(null);
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await getMessengerMe();
    const current = await loadMessengerSession();
    if (!current) return;
    const next = { ...current, user };
    await saveMessengerSession(next);
    setSession(next);
    setStatus("authenticated");
  }, []);

  const value = useMemo<MessengerAuthContextValue>(
    () => ({
      status,
      session,
      passwordChange,
      isAuthenticated: status === "authenticated" && Boolean(session),
      login,
      register,
      completePasswordChange,
      cancelPasswordChange,
      refreshUser,
      logout,
    }),
    [
      cancelPasswordChange,
      completePasswordChange,
      login,
      logout,
      passwordChange,
      refreshUser,
      register,
      session,
      status,
    ],
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
