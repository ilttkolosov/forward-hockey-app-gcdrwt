import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import { AppState, InteractionManager } from "react-native";
import type {
  MessengerPasswordChangeRequired,
  MessengerRulesStatus,
  MessengerSession,
} from "../features/messenger/types";
import MessengerRulesModal from "../features/messenger/MessengerRulesModal";
import {
  clearMessengerAliases,
  prepareMessengerAliases,
} from "../features/messenger/aliases";
import {
  acceptMessengerRules,
  completeMessengerPasswordChange,
  getMessengerRulesStatus,
  ensureFreshMessengerSession,
  getMessengerMe,
  isMessengerAccessTokenUsable,
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
  subscribeMessengerRealtime,
} from "../services/messengerRealtime";
import { cancelAllManagedMessengerMediaUploads } from "../services/messengerMediaUploadManager";
import {
  playMessengerSound,
  setMessengerMutedRooms,
  unloadMessengerSounds,
} from "../services/messengerSounds";
import {
  setAnalyticsMessengerRole,
  trackMessengerAction,
} from "../services/analyticsService";
import { waitForAppInteractive } from "../services/appInteractive";

type MessengerAuthStatus =
  "loading" | "authenticated" | "unauthenticated" | "password_change_required";

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

const RULES_STATUS_MIN_INTERVAL_MS = 5 * 60_000;

async function recoverMessengerTransport(force = false): Promise<void> {
  const fresh = await ensureFreshMessengerSession({ force });
  connectMessengerRealtime(fresh.access_token);
  resumeMessengerRealtime();
}

async function loadPersistedMessengerSession(): Promise<MessengerSession | null> {
  const delays = [0, 120, 350] as const;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const stored = await loadMessengerSession();
    if (stored) return stored;
  }
  return null;
}

export function MessengerAuthProvider({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const [status, setStatus] = useState<MessengerAuthStatus>("loading");
  const [session, setSession] = useState<MessengerSession | null>(null);
  const [passwordChange, setPasswordChange] =
    useState<MessengerPasswordChangeRequired | null>(null);
  const [rulesStatus, setRulesStatus] = useState<MessengerRulesStatus | null>(
    null,
  );
  const [rulesBusy, setRulesBusy] = useState(false);
  const rulesCheckRef = useRef<{
    userId: string | null;
    checkedAt: number;
    value: MessengerRulesStatus | null;
    inFlight: Promise<MessengerRulesStatus> | null;
  }>({ userId: null, checkedAt: 0, value: null, inFlight: null });

  const refreshRulesStatus = useCallback(
    async (force = false): Promise<void> => {
      const userId = session?.user.id ?? null;
      if (!userId) {
        rulesCheckRef.current = {
          userId: null,
          checkedAt: 0,
          value: null,
          inFlight: null,
        };
        setRulesStatus(null);
        return;
      }
      if (rulesCheckRef.current.userId !== userId) {
        rulesCheckRef.current = {
          userId,
          checkedAt: 0,
          value: null,
          inFlight: null,
        };
      }
      const state = rulesCheckRef.current;
      if (
        !force &&
        state.value &&
        Date.now() - state.checkedAt < RULES_STATUS_MIN_INTERVAL_MS
      ) {
        setRulesStatus(state.value);
        return;
      }
      if (state.inFlight) {
        const value = await state.inFlight;
        if (rulesCheckRef.current.userId === userId) setRulesStatus(value);
        return;
      }

      const request = getMessengerRulesStatus();
      state.inFlight = request;
      try {
        const value = await request;
        if (rulesCheckRef.current.userId !== userId) return;
        state.checkedAt = Date.now();
        state.value = value;
        setRulesStatus(value);
      } finally {
        if (state.inFlight === request) state.inFlight = null;
      }
    },
    [session?.user.id],
  );

  useEffect(() => {
    setAnalyticsMessengerRole(
      session?.user.roles.map((role) => role.code) ?? [],
    );
  }, [session?.user.roles]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeMessengerSession((nextSession) => {
      if (!active) return;
      if (nextSession) {
        void prepareMessengerAliases(nextSession.user.id).then(() => {
          if (!active) return;
          setSession(nextSession);
          setPasswordChange(null);
          setStatus("authenticated");
        });
      } else {
        clearMessengerAliases();
        setSession(null);
        setStatus((current) =>
          current === "password_change_required" ? current : "unauthenticated",
        );
      }
    });
    void Promise.all([
      loadPersistedMessengerSession(),
      loadMessengerPasswordChange(),
    ]).then(async ([stored, pendingPasswordChange]) => {
      if (!active) return;
      if (stored) {
        await prepareMessengerAliases(stored.user.id);
        if (!active) return;
        setSession(stored);
        setPasswordChange(null);
        setStatus("authenticated");
        if (pendingPasswordChange) await clearMessengerPasswordChange();
        try {
          await waitForAppInteractive();
          if (!active) return;
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
    if (
      !session ||
      !pathname.startsWith("/messenger") ||
      pathname.startsWith("/messenger/register")
    ) {
      setRulesStatus(null);
      return;
    }
    const interaction = InteractionManager.runAfterInteractions(() => {
      void refreshRulesStatus().catch((error) =>
        console.warn("[Messenger] Проверка принятия Правил отложена:", error),
      );
    });
    return () => interaction.cancel();
  }, [pathname, refreshRulesStatus, session]);

  useEffect(() => {
    const accessToken = session?.access_token;
    let active = true;
    if (accessToken) {
      void waitForAppInteractive()
        .then(() => ensureFreshMessengerSession())
        .then((fresh) => {
          if (active) connectMessengerRealtime(fresh.access_token);
        })
        .catch((error) => {
          // A still-valid token may be used during a temporary refresh outage.
          // Never open a socket with an already expired token: the server must
          // not force-disconnect it before recovery can rotate the session.
          if (active && isMessengerAccessTokenUsable(accessToken)) {
            connectMessengerRealtime(accessToken);
          } else {
            console.warn(
              "[Messenger] Подключение отложено до обновления сессии:",
              error,
            );
          }
        });
    } else {
      cancelAllManagedMessengerMediaUploads();
      disconnectMessengerRealtime();
    }
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setMessengerMutedRooms([]);
      return;
    }
    const heard = new Set<string>();
    const unsubscribe = subscribeMessengerRealtime((event) => {
      if (event.type !== "message.created" || event.message.kind === "system") {
        return;
      }
      if (AppState.currentState !== "active" || heard.has(event.message.id)) {
        return;
      }
      heard.add(event.message.id);
      if (heard.size > 300) heard.delete(heard.values().next().value as string);
      void playMessengerSound(
        event.message.author.id === userId ? "sent" : "received",
        event.message.room_id,
      );
    });
    return () => {
      unsubscribe();
    };
  }, [session?.user.id]);

  useEffect(
    () => () => {
      void unloadMessengerSounds();
    },
    [],
  );

  useEffect(() => {
    let recovery: Promise<void> | null = null;
    return subscribeMessengerRealtime((event) => {
      if (
        event.type !== "connection.state" ||
        event.connected ||
        ![
          "authentication_required",
          "authentication_failed",
          "invalid_access_token",
        ].includes(event.reason ?? "")
      ) {
        return;
      }
      if (recovery) return;
      recovery = recoverMessengerTransport(true)
        .catch((error) =>
          console.warn(
            "[Messenger] Повторная авторизация realtime отложена:",
            error,
          ),
        )
        .finally(() => {
          recovery = null;
        });
    });
  }, []);

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
      void loadPersistedMessengerSession().then((restored) => {
        if (!restored) return;
        void prepareMessengerAliases(restored.user.id).then(() => {
          setSession(restored);
          setPasswordChange(null);
          setStatus("authenticated");
        });
      });
      void recoverMessengerTransport().catch((error) =>
        console.warn(
          "[Messenger] Восстановление соединения после фона отложено:",
          error,
        ),
      );
      void refreshRulesStatus().catch((error) =>
        console.warn("[Messenger] Проверка Правил после фона отложена:", error),
      );
    });
    return () => subscription.remove();
  }, [refreshRulesStatus]);

  useEffect(() => {
    let initialized = false;
    let unavailable = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const available =
        state.isConnected === true && state.isInternetReachable !== false;
      if (!initialized) {
        initialized = true;
        unavailable = !available;
        return;
      }
      const recovered = available && unavailable;
      unavailable = !available;
      if (!recovered) return;
      void recoverMessengerTransport().catch((error) =>
        console.warn(
          "[Messenger] Восстановление соединения после возврата сети отложено:",
          error,
        ),
      );
    });
    return unsubscribe;
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<"authenticated" | "password_change_required"> => {
      setStatus("loading");
      try {
        clearMessengerAliases();
        const result = await loginToMessenger(username, password);
        if ("password_change_required" in result) {
          setSession(null);
          setPasswordChange(result);
          setStatus("password_change_required");
          return "password_change_required";
        }
        await prepareMessengerAliases(result.user.id);
        setSession(result);
        setPasswordChange(null);
        setStatus("authenticated");
        setAnalyticsMessengerRole(result.user.roles.map((role) => role.code));
        trackMessengerAction("auth_completed", { method: "login" });
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
        clearMessengerAliases();
        const authenticated = await registerInMessenger(payload);
        await prepareMessengerAliases(authenticated.user.id);
        setSession(authenticated);
        setPasswordChange(null);
        setStatus("authenticated");
        setAnalyticsMessengerRole(
          authenticated.user.roles.map((role) => role.code),
        );
        trackMessengerAction("auth_completed", { method: "registration" });
      } catch (error) {
        setStatus("unauthenticated");
        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await logoutFromMessenger();
    } finally {
      clearMessengerAliases();
      setSession(null);
      setPasswordChange(null);
      setStatus("unauthenticated");
    }
  }, []);

  const completePasswordChange = useCallback(
    async (password: string, passwordConfirmation: string) => {
      if (!passwordChange) throw new Error("Сеанс смены пароля не найден");
      setStatus("loading");
      try {
        clearMessengerAliases();
        const authenticated = await completeMessengerPasswordChange(
          passwordChange.change_token,
          password,
          passwordConfirmation,
        );
        await prepareMessengerAliases(authenticated.user.id);
        setSession(authenticated);
        setPasswordChange(null);
        setStatus("authenticated");
        setAnalyticsMessengerRole(
          authenticated.user.roles.map((role) => role.code),
        );
        trackMessengerAction("auth_completed", { method: "password_change" });
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
      <MessengerRulesModal
        visible={Boolean(
          session &&
          pathname.startsWith("/messenger") &&
          rulesStatus &&
          !rulesStatus.accepted &&
          !pathname.startsWith("/messenger/register"),
        )}
        rules={rulesStatus?.current}
        busy={rulesBusy}
        cancelLabel="Выйти"
        onAccept={async (rules, appVersion, appBuild) => {
          setRulesBusy(true);
          try {
            await acceptMessengerRules({
              version: rules.version,
              sha256: rules.sha256,
              confirmation_method: rulesStatus?.accepted_rules_version_id
                ? "rules_update_checkbox"
                : "login_checkbox",
              app_version: appVersion,
              app_build: appBuild,
            });
            setRulesStatus((current) =>
              current
                ? {
                    ...current,
                    accepted: true,
                    accepted_rules_version_id: rules.id,
                  }
                : current,
            );
            if (
              rulesStatus &&
              session &&
              rulesCheckRef.current.userId === session.user.id
            ) {
              const accepted = {
                ...rulesStatus,
                accepted: true,
                accepted_rules_version_id: rules.id,
              };
              rulesCheckRef.current.value = accepted;
              rulesCheckRef.current.checkedAt = Date.now();
            }
          } finally {
            setRulesBusy(false);
          }
        }}
        onCancel={logout}
      />
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
