import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { usePersistentBottomNavigationInset } from "../../components/PersistentBottomNavigation";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { colors } from "../../styles/commonStyles";

export default function MessengerChangePasswordScreen() {
  const router = useRouter();
  const bottomNavigationInset = usePersistentBottomNavigationInset();
  const params = useLocalSearchParams<{ sharePending?: string }>();
  const authenticatedDestination =
    params.sharePending === "1" ? "/messenger/share" : "/messenger/rooms";
  const {
    status,
    passwordChange,
    completePasswordChange,
    cancelPasswordChange,
  } = useMessengerAuth();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(authenticatedDestination);
    else if (status === "unauthenticated" && !passwordChange) {
      router.replace({
        pathname: "/messenger/register",
        params:
          params.sharePending === "1" ? { sharePending: "1" } : undefined,
      });
    }
  }, [
    authenticatedDestination,
    params.sharePending,
    passwordChange,
    router,
    status,
  ]);

  const submit = async () => {
    if (password.length < 6) {
      setError("Пароль должен содержать не менее 6 символов.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Введённые пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completePasswordChange(password, passwordConfirmation);
      router.replace(authenticatedDestination);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Не удалось изменить пароль",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = () => {
    Alert.alert(
      "Прервать смену пароля?",
      "Временный пароль уже использован. Для повторного входа администратор должен будет выдать новый.",
      [
        { text: "Продолжить смену", style: "cancel" },
        {
          text: "Прервать",
          style: "destructive",
          onPress: () => {
            void cancelPasswordChange()
              .then(() =>
                router.replace({
                  pathname: "/messenger/register",
                  params:
                    params.sharePending === "1"
                      ? { sharePending: "1" }
                      : undefined,
                }),
              )
              .catch((cancelError: unknown) => {
                setError(
                  cancelError instanceof Error
                    ? cancelError.message
                    : "Не удалось отменить смену пароля",
                );
              });
          },
        },
      ],
    );
  };

  if (!passwordChange) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomNavigationInset },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Icon name="key" size={38} color={colors.primary} />
            </View>
            <Text style={styles.title}>Задайте новый пароль</Text>
            <Text style={styles.helper}>
              Временный пароль для @{passwordChange.user.username} принят и
              больше не действует. Теперь установите собственный пароль.
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Новый пароль (не менее 6 символов)"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              maxLength={128}
            />
            <TextInput
              style={styles.input}
              value={passwordConfirmation}
              onChangeText={setPasswordConfirmation}
              placeholder="Повторите новый пароль"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              maxLength={128}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.disabled]}
              onPress={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Сохранить пароль и войти
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.expiry}>
              Смену необходимо завершить до{" "}
              {new Date(passwordChange.change_token_expires_at).toLocaleString(
                "ru-RU",
              )}
              .
            </Text>
            <TouchableOpacity onPress={confirmCancel} disabled={busy}>
              <Text style={styles.cancelText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingBottom: 44,
  },
  card: {
    alignItems: "center",
    gap: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    backgroundColor: colors.backgroundAlt,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  helper: {
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    width: "100%",
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: colors.backgroundAlt,
  },
  error: { color: colors.error, textAlign: "center" },
  primaryButton: {
    width: "100%",
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  disabled: { opacity: 0.55 },
  expiry: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  cancelText: { color: colors.error, fontWeight: "700" },
});
