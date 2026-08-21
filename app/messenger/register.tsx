import * as Clipboard from "expo-clipboard";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import MessengerRulesModal from "../../features/messenger/MessengerRulesModal";
import type { InvitationPreview, MessengerRulesVersion } from "../../features/messenger/types";
import {
  acceptMessengerRules,
  previewMessengerInvitation,
  rejectMessengerInvitationRules,
} from "../../services/messengerApi";
import {
  enableMessengerPush,
  markMessengerPushOffered,
  shouldOfferMessengerPush,
} from "../../services/messengerPush";
import { loadMessengerSession } from "../../services/messengerSession";
import { colors } from "../../styles/commonStyles";

type ScreenMode = "invite" | "login";

const roleLabels: Record<string, string> = {
  player: "Игрок",
  captain: "Капитан",
  assistant: "Ассистент",
  coaching_staff: "Тренерский штаб",
  parent: "Родитель",
  parent_committee: "Родительский комитет",
  fan: "Болельщик",
  administrator: "Администратор",
};

function extractInviteToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const queryMatch = trimmed.match(/[?&]token=([^&#]+)/i);
  if (queryMatch?.[1]) {
    try {
      return decodeURIComponent(queryMatch[1]);
    } catch {
      return queryMatch[1];
    }
  }
  return trimmed.length >= 32 && trimmed.length <= 256 ? trimmed : null;
}

export default function MessengerRegistrationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token?: string;
    sharePending?: string;
  }>();
  const { isAuthenticated, passwordChange, login, register } =
    useMessengerAuth();
  const authenticatedDestination =
    params.sharePending === "1" ? "/messenger/share" : "/messenger/rooms";
  const [mode, setMode] = useState<ScreenMode>("invite");
  const [inviteValue, setInviteValue] = useState(params.token || "");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [registeringNewAccount, setRegisteringNewAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesVisible, setRulesVisible] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !registeringNewAccount)
      router.replace(authenticatedDestination);
  }, [
    authenticatedDestination,
    isAuthenticated,
    registeringNewAccount,
    router,
  ]);

  useEffect(() => {
    if (passwordChange) {
      router.replace({
        pathname: "/messenger/change-password",
        params:
          params.sharePending === "1" ? { sharePending: "1" } : undefined,
      });
    }
  }, [params.sharePending, passwordChange, router]);

  const checkInvitation = useCallback(async (value: string) => {
    const token = extractInviteToken(value);
    if (!token) {
      setError("Вставьте полную пригласительную ссылку или корректный токен.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await previewMessengerInvitation(token);
      if (!result.can_register) {
        setError("Это приглашение уже использовано, отозвано или просрочено.");
        return;
      }
      setInviteToken(token);
      setPreview(result);
      setDisplayName(result.display_name || "");
      setInviteValue(value);
      setScannerVisible(false);
      console.log(`[Messenger] Приглашение ${result.id} успешно проверено`);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "Приглашение не найдено",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (params.token) void checkInvitation(params.token);
  }, [checkInvitation, params.token]);

  const pasteInvitation = async () => {
    const clipboardValue = await Clipboard.getStringAsync();
    setInviteValue(clipboardValue);
    await checkInvitation(clipboardValue);
  };

  const openScanner = async () => {
    let granted = permission?.granted;
    if (!granted) {
      const response = await requestPermission();
      granted = response.granted;
    }
    if (!granted) {
      Alert.alert(
        "Нужен доступ к камере",
        "Разрешите доступ к камере для сканирования QR-кода.",
      );
      return;
    }
    setScannerVisible(true);
    setError(null);
  };

  const handleBarcode = ({ data }: BarcodeScanningResult) => {
    if (busy) return;
    setScannerVisible(false);
    setInviteValue(data);
    void checkInvitation(data);
  };

  const submitRegistration = () => {
    if (!inviteToken || !preview) return;
    if (password.length < 6) {
      setError("Пароль должен содержать не менее 6 символов.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Введённые пароли не совпадают.");
      return;
    }
    setError(null);
    setRulesVisible(true);
  };

  const completeRegistration = async (
    rules: MessengerRulesVersion,
    appVersion: string,
    appBuild?: string,
  ) => {
    if (!inviteToken) return;
    setRegisteringNewAccount(true);
    setBusy(true);
    setError(null);
    try {
      await register({
        invite_token: inviteToken,
        username: username.trim(),
        password,
        display_name: displayName.trim() || undefined,
        email: email.trim() || undefined,
      });
      await acceptMessengerRules({
        version: rules.version,
        sha256: rules.sha256,
        confirmation_method: "registration_checkbox",
        app_version: appVersion,
        app_build: appBuild,
      });
      setRulesVisible(false);
      const finish = () =>
        params.sharePending === "1"
          ? router.replace("/messenger/share")
          : router.replace({
              pathname: "/messenger/profile",
              params: { firstRun: "1" },
            });
      const activatedSession = await loadMessengerSession();
      if (
        activatedSession &&
        (await shouldOfferMessengerPush(activatedSession.user.id))
      ) {
        await markMessengerPushOffered(activatedSession.user.id);
        Alert.alert(
          "Уведомления о сообщениях",
          "Разрешить PUSH-уведомления мессенджера, системный звук и бейдж непрочитанных сообщений?",
          [
            { text: "Позже", style: "cancel", onPress: finish },
            {
              text: "Разрешить",
              onPress: () => {
                void enableMessengerPush(true)
                  .then(finish)
                  .catch((pushError) => {
                    Alert.alert(
                      "Уведомления не включены",
                      pushError instanceof Error
                        ? pushError.message
                        : "Разрешение можно выдать позже в настройках.",
                      [{ text: "OK", onPress: finish }],
                    );
                  });
              },
            },
          ],
          { cancelable: false },
        );
      } else {
        finish();
      }
    } catch (registrationError) {
      setRegisteringNewAccount(false);
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : "Не удалось зарегистрироваться",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await login(username.trim(), password);
      if (result === "password_change_required") {
        router.replace({
          pathname: "/messenger/change-password",
          params:
            params.sharePending === "1" ? { sharePending: "1" } : undefined,
        });
      } else {
        router.replace(authenticatedDestination);
      }
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Не удалось войти",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace("/")}
            >
              <Icon name="chevron-back" size={28} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>Общение</Text>
              <Text style={styles.subtitle}>Вход в командный мессенджер</Text>
            </View>
          </View>

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === "invite" && styles.modeButtonActive,
              ]}
              onPress={() => {
                setMode("invite");
                setError(null);
              }}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "invite" && styles.modeTextActive,
                ]}
              >
                Приглашение
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === "login" && styles.modeButtonActive,
              ]}
              onPress={() => {
                setMode("login");
                setError(null);
                setScannerVisible(false);
              }}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "login" && styles.modeTextActive,
                ]}
              >
                Уже есть аккаунт
              </Text>
            </TouchableOpacity>
          </View>

          {mode === "invite" && !preview && (
            <View style={styles.card}>
              <Icon name="chatbubbles" size={42} color={colors.primary} />
              <Text style={styles.cardTitle}>Присоединиться к команде</Text>
              <Text style={styles.helper}>
                Вставьте ссылку, полученную от администратора, или отсканируйте
                QR-код.
              </Text>
              <TextInput
                style={styles.input}
                value={inviteValue}
                onChangeText={setInviteValue}
                placeholder="Пригласительная ссылка"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={pasteInvitation}
                >
                  <Icon name="clipboard" size={22} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Вставить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={openScanner}
                >
                  <Icon name="qr-code" size={22} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>QR-код</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => void checkInvitation(inviteValue)}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Проверить приглашение
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {scannerVisible && (
            <View style={styles.scannerCard}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handleBarcode}
              />
              <Text style={styles.scannerHint}>Наведите камеру на QR-код</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setScannerVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>Закрыть камеру</Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === "invite" && preview && (
            <View style={styles.card}>
              <View style={styles.successBadge}>
                <Icon
                  name="checkmark-circle"
                  size={22}
                  color={colors.success}
                />
                <Text style={styles.successText}>Приглашение подтверждено</Text>
              </View>
              <Text style={styles.cardTitle}>{preview.team_name}</Text>
              <Text style={styles.helper}>
                {preview.role_codes
                  .map((role) => roleLabels[role] || role)
                  .join(", ")}
              </Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Имя и фамилия"
              />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Логин (3–32 символа)"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Пароль (не менее 6 символов)"
                secureTextEntry
                autoCapitalize="none"
                maxLength={128}
              />
              <TextInput
                style={styles.input}
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
                placeholder="Повторите пароль"
                secureTextEntry
                autoCapitalize="none"
                maxLength={128}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="E-mail (необязательно)"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={submitRegistration}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Создать аккаунт</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setPreview(null);
                  setInviteToken(null);
                }}
              >
                <Text style={styles.linkText}>
                  Использовать другое приглашение
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === "login" && (
            <View style={styles.card}>
              <Icon name="person-circle" size={48} color={colors.primary} />
              <Text style={styles.cardTitle}>Вход</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Логин"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Пароль"
                secureTextEntry
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={submitLogin}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Войти</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
      <MessengerRulesModal
        visible={rulesVisible}
        busy={busy}
        onAccept={completeRegistration}
        onCancel={async () => {
          if (!inviteToken || busy) return;
          setBusy(true);
          try {
            const result = await rejectMessengerInvitationRules(inviteToken);
            setRulesVisible(false);
            if (result.invitation_revoked) {
              Alert.alert("Приглашение аннулировано", "Правила не были приняты три раза.");
            }
            router.back();
          } catch (cancelError) {
            setError(cancelError instanceof Error ? cancelError.message : "Не удалось отменить регистрацию");
          } finally {
            setBusy(false);
          }
        }}
      />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 44 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 8 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 2, fontSize: 14, color: colors.textSecondary },
  modeRow: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center",
  },
  modeButtonActive: { backgroundColor: colors.primary },
  modeText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  modeTextActive: { color: colors.white },
  card: {
    alignItems: "center",
    gap: 13,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  helper: { color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  input: {
    width: "100%",
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: colors.background,
  },
  actionRow: { width: "100%", flexDirection: "row", gap: 10 },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  secondaryButtonText: { color: colors.primary, fontWeight: "700" },
  primaryButton: {
    width: "100%",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  scannerCard: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  camera: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  scannerHint: { color: colors.textSecondary, textAlign: "center" },
  successBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  successText: { color: colors.success, fontWeight: "700" },
  linkText: { color: colors.primary, fontWeight: "700", padding: 8 },
  error: {
    marginTop: 16,
    color: colors.error,
    textAlign: "center",
    lineHeight: 20,
  },
});
