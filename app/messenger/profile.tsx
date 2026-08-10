import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../features/messenger/AuthenticatedAvatar";
import {
  removeMessengerAvatar,
  updateMessengerProfile,
  uploadMessengerAvatar,
} from "../../services/messengerApi";
import { messengerLog } from "../../services/messengerLogger";
import { colors } from "../../styles/commonStyles";

export default function MessengerProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ firstRun?: string }>();
  const { session, isAuthenticated, refreshUser } = useMessengerAuth();
  const [displayName, setDisplayName] = useState(
    session?.user.display_name || "",
  );
  const [selectedAsset, setSelectedAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/messenger/register");
  }, [isAuthenticated, router]);

  useEffect(() => {
    setDisplayName(session?.user.display_name || "");
  }, [session?.user.display_name]);

  const chooseAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedAsset(result.assets[0]);
      setError(null);
    }
  };

  const save = async () => {
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Имя должно содержать не менее 2 символов.");
      return;
    }
    setBusy(true);
    setError(null);
    messengerLog("info", "profile.save.started", {
      has_new_avatar: Boolean(selectedAsset),
      first_run: params.firstRun === "1",
    });
    try {
      await updateMessengerProfile(name);
      if (selectedAsset) {
        await uploadMessengerAvatar({
          uri: selectedAsset.uri,
          name: selectedAsset.fileName || `avatar-${Date.now()}.jpg`,
          type: selectedAsset.mimeType || "image/jpeg",
        });
      }
      await refreshUser();
      setSelectedAsset(null);
      console.log("[Messenger profile] Профиль пользователя сохранён");
      messengerLog("info", "profile.save.completed", {
        avatar_uploaded: Boolean(selectedAsset),
      });
      if (params.firstRun === "1") router.replace("/messenger/rooms");
      else router.back();
    } catch (saveError) {
      messengerLog("warn", "profile.save.failed", {
        message:
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить профиль",
      });
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить профиль",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (selectedAsset) {
      setSelectedAsset(null);
      return;
    }
    Alert.alert("Удалить фотографию?", "Вместо неё будут показаны инициалы.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          setError(null);
          void removeMessengerAvatar()
            .then(refreshUser)
            .catch((removeError) =>
              setError(
                removeError instanceof Error
                  ? removeError.message
                  : "Не удалось удалить фотографию",
              ),
            )
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  if (!session) return null;

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
              style={styles.iconButton}
              onPress={() =>
                params.firstRun === "1"
                  ? router.replace("/messenger/rooms")
                  : router.back()
              }
            >
              <Icon name="chevron-back" size={28} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {params.firstRun === "1" ? "Настройте профиль" : "Мой профиль"}
              </Text>
              <Text style={styles.subtitle}>Имя и фотография в сообщениях</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.avatarWrap}>
              {selectedAsset ? (
                <Image
                  source={selectedAsset.uri}
                  style={styles.avatarPreview}
                  contentFit="cover"
                />
              ) : (
                <AuthenticatedAvatar
                  displayName={session.user.display_name}
                  avatarUrl={session.user.avatar_url}
                  accessToken={session.access_token}
                  size={112}
                />
              )}
            </View>
            <TouchableOpacity style={styles.photoButton} onPress={chooseAvatar}>
              <Icon name="camera" size={20} color={colors.primary} />
              <Text style={styles.photoButtonText}>Выбрать фотографию</Text>
            </TouchableOpacity>
            {(selectedAsset || session.user.avatar_url) && (
              <TouchableOpacity onPress={removeAvatar} disabled={busy}>
                <Text style={styles.removeText}>
                  {selectedAsset ? "Отменить выбор" : "Удалить фотографию"}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Имя в мессенджере</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={100}
                autoCapitalize="words"
                placeholder="Имя и фамилия"
              />
            </View>
            <Text style={styles.helper}>
              Изменение профиля не затрагивает роль, права и историю сообщений.
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.saveButton, busy && styles.disabled]}
              onPress={save}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
            {params.firstRun === "1" && (
              <TouchableOpacity
                onPress={() => router.replace("/messenger/rooms")}
                disabled={busy}
              >
                <Text style={styles.skipText}>Настроить позже</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.backgroundAlt },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 30 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 6 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  card: {
    margin: 18,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  avatarWrap: { marginBottom: 16 },
  avatarPreview: { width: 112, height: 112, borderRadius: 56 },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#EAF3FF",
  },
  photoButtonText: { color: colors.primary, fontWeight: "800" },
  removeText: { marginTop: 12, color: colors.error, fontWeight: "700" },
  field: { width: "100%", marginTop: 24 },
  label: {
    marginBottom: 7,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    backgroundColor: colors.backgroundAlt,
  },
  helper: {
    width: "100%",
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  error: { width: "100%", marginTop: 12, color: colors.error },
  saveButton: {
    width: "100%",
    minHeight: 50,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  saveText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  skipText: { marginTop: 16, color: colors.primary, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
