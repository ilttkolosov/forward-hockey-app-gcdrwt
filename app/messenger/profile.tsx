import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { clearMessengerLocalData } from "../../features/messenger/repository";
import type { MessengerRoom } from "../../features/messenger/types";
import {
  deleteMessengerAccount,
  getMessengerRooms,
  leaveMessengerRoom,
  messengerErrorMessage,
  removeMessengerAvatar,
  updateMessengerProfile,
  uploadMessengerAvatar,
} from "../../services/messengerApi";
import { messengerLog } from "../../services/messengerLogger";
import {
  clearMessengerMediaCache,
  formatMessengerBytes,
  messengerMediaCacheSize,
} from "../../services/messengerMediaCache";
import { colors } from "../../styles/commonStyles";

function newDeletionChallenge(): { left: number; right: number } {
  return {
    left: 10 + Math.floor(Math.random() * 90),
    right: 10 + Math.floor(Math.random() * 90),
  };
}

function roomTypeLabel(room: MessengerRoom): string {
  if (room.room_type === "direct") return "Личный чат";
  if (room.room_type === "private_group") return "Мини-группа";
  return "Системная группа";
}

export default function MessengerProfileScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ firstRun?: string }>();
  const { session, isAuthenticated, refreshUser, logout } = useMessengerAuth();
  const [displayName, setDisplayName] = useState(
    session?.user.display_name || "",
  );
  const [selectedAsset, setSelectedAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<MessengerRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [leavingRoomId, setLeavingRoomId] = useState<string | null>(null);
  const [deletionVisible, setDeletionVisible] = useState(false);
  const [deletionChallenge, setDeletionChallenge] =
    useState(newDeletionChallenge);
  const [deletionAnswer, setDeletionAnswer] = useState("");
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/messenger/register");
  }, [isAuthenticated, router]);

  useEffect(() => {
    setDisplayName(session?.user.display_name || "");
  }, [session?.user.display_name]);

  useEffect(() => {
    void messengerMediaCacheSize()
      .then(setCacheBytes)
      .catch((cacheError) =>
        messengerLog("warn", "media.cache.size_failed", {
          message:
            cacheError instanceof Error
              ? cacheError.message
              : "Неизвестная ошибка",
        }),
      );
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    setRoomsLoading(true);
    setRoomsError(null);
    void getMessengerRooms()
      .then((items) => {
        if (active) setRooms(items);
      })
      .catch((loadError) => {
        if (active) {
          setRoomsError(
            messengerErrorMessage(
              loadError,
              "Не удалось загрузить группы и чаты",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setRoomsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

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

  const confirmLogout = () => {
    if (logoutBusy) return;
    Alert.alert(
      "Выйти из учётной записи?",
      "Для продолжения потребуется снова ввести логин и пароль.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Выйти",
          style: "destructive",
          onPress: () => {
            setLogoutBusy(true);
            void logout()
              .then(() => router.replace("/messenger/register"))
              .finally(() => setLogoutBusy(false));
          },
        },
      ],
    );
  };

  const confirmClearCache = () => {
    Alert.alert(
      "Очистить кэш медиа?",
      "Локальные копии фото, видео и файлов будут удалены с устройства. На сервере вложения сохранятся и при необходимости загрузятся снова.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Очистить",
          style: "destructive",
          onPress: () => {
            setCacheBusy(true);
            void clearMessengerMediaCache()
              .then(() => setCacheBytes(0))
              .catch((cacheError) =>
                Alert.alert(
                  "Не удалось очистить кэш",
                  cacheError instanceof Error
                    ? cacheError.message
                    : "Повторите попытку позже",
                ),
              )
              .finally(() => setCacheBusy(false));
          },
        },
      ],
    );
  };

  const openRoom = (room: MessengerRoom) => {
    router.push({
      pathname: "/messenger/room/[id]",
      params: {
        id: room.id,
        title: room.title,
        canWrite: String(room.can_write),
        canMedia: String(room.can_send_media),
        canReact: String(room.can_react),
        canManage: String(room.can_manage),
        roomType: room.room_type,
        teamId: room.team_id,
        avatarUrl: room.avatar_url || "",
        lastReadSequence: room.last_read_sequence,
        latestSequence: room.last_message?.sequence || "",
        unreadCount: String(room.unread_count),
        memberCount:
          typeof room.member_count === "number"
            ? String(room.member_count)
            : "",
        peerId: room.peer?.id || "",
        peerLastSeenAt: room.peer?.last_seen_at || "",
      },
    });
  };

  const performLeaveRoom = async (room: MessengerRoom) => {
    setLeavingRoomId(room.id);
    setRoomsError(null);
    try {
      await leaveMessengerRoom(room.id);
      setRooms((current) => current.filter((item) => item.id !== room.id));
    } catch (leaveError) {
      setRoomsError(
        messengerErrorMessage(
          leaveError,
          "Не удалось выйти из группы или чата",
        ),
      );
    } finally {
      setLeavingRoomId(null);
    }
  };

  const confirmLeaveRoom = (room: MessengerRoom) => {
    if (!room.can_leave) return;
    const direct = room.room_type === "direct";
    Alert.alert(
      direct ? "Удалить личный чат?" : "Выйти из группы?",
      direct
        ? "Чат исчезнет из вашего списка, а второй участник увидит служебное сообщение. Открыть чат снова можно через контакты."
        : "В группе появится служебное сообщение о выходе. Если вы администратор, управление будет передано другому участнику.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: direct ? "Удалить" : "Выйти",
          style: "destructive",
          onPress: () => void performLeaveRoom(room),
        },
      ],
    );
  };

  const openAccountDeletion = () => {
    setDeletionChallenge(newDeletionChallenge());
    setDeletionAnswer("");
    setDeletionError(null);
    setDeletionVisible(true);
  };

  const deletionAnswerIsCorrect =
    /^\d+$/.test(deletionAnswer.trim()) &&
    Number(deletionAnswer) === deletionChallenge.left + deletionChallenge.right;

  const permanentlyDeleteAccount = async () => {
    if (!deletionAnswerIsCorrect || deletionBusy) return;
    setDeletionBusy(true);
    setDeletionError(null);
    try {
      await deleteMessengerAccount();
      await Promise.allSettled([
        clearMessengerLocalData(db),
        clearMessengerMediaCache(),
      ]);
      setDeletionVisible(false);
      router.replace("/messenger/register");
    } catch (deleteError) {
      setDeletionError(
        messengerErrorMessage(deleteError, "Не удалось удалить профиль"),
      );
    } finally {
      setDeletionBusy(false);
    }
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

          <View style={styles.cacheCard}>
            <View style={styles.cacheIcon}>
              <Icon name="folder-open" size={25} color={colors.primary} />
            </View>
            <View style={styles.cacheText}>
              <Text style={styles.cacheTitle}>Кэш медиа</Text>
              <Text style={styles.cacheSubtitle}>
                На устройстве: {formatMessengerBytes(cacheBytes)}. Оригиналы
                остаются на сервере.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.cacheButton, cacheBusy && styles.disabled]}
              onPress={confirmClearCache}
              disabled={cacheBusy || cacheBytes === 0}
            >
              {cacheBusy ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={styles.cacheButtonText}>Очистить</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.roomsCard}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingText}>
                <Text style={styles.sectionTitle}>Группы и чаты</Text>
                <Text style={styles.sectionSubtitle}>
                  Доступные системные группы и ваши диалоги
                </Text>
              </View>
              {roomsLoading && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>
            {roomsError && <Text style={styles.roomsError}>{roomsError}</Text>}
            {!roomsLoading && rooms.length === 0 ? (
              <Text style={styles.emptyRoomsText}>
                Доступных групп и чатов пока нет.
              </Text>
            ) : (
              rooms.map((room, index) => (
                <View
                  key={room.id}
                  style={[
                    styles.roomRow,
                    index < rooms.length - 1 && styles.roomRowBorder,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.roomOpenTarget}
                    onPress={() => openRoom(room)}
                    accessibilityRole="button"
                    accessibilityLabel={`Открыть ${room.title}`}
                  >
                    <AuthenticatedAvatar
                      displayName={room.title}
                      avatarUrl={room.avatar_url}
                      accessToken={session.access_token}
                      size={46}
                    />
                    <View style={styles.roomText}>
                      <Text style={styles.roomTitle} numberOfLines={1}>
                        {room.title}
                      </Text>
                      <Text style={styles.roomSubtitle} numberOfLines={1}>
                        {roomTypeLabel(room)} · {room.team_name}
                      </Text>
                    </View>
                    <Icon
                      name="chevron-forward"
                      size={19}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {room.can_leave ? (
                    <TouchableOpacity
                      style={styles.leaveRoomButton}
                      onPress={() => confirmLeaveRoom(room)}
                      disabled={leavingRoomId !== null}
                      accessibilityRole="button"
                      accessibilityLabel={
                        room.room_type === "direct"
                          ? `Удалить чат ${room.title}`
                          : `Выйти из группы ${room.title}`
                      }
                    >
                      {leavingRoomId === room.id ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <Icon
                          name="log-out-outline"
                          size={21}
                          color={colors.error}
                        />
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={styles.systemRoomMark}
                      accessibilityLabel="Из системной группы выйти нельзя"
                    >
                      <Icon
                        name="lock-closed-outline"
                        size={16}
                        color={colors.textSecondary}
                      />
                    </View>
                  )}
                </View>
              ))
            )}
          </View>

          <TouchableOpacity
            style={styles.logoutCard}
            onPress={confirmLogout}
            disabled={logoutBusy}
            accessibilityRole="button"
            accessibilityLabel="Выйти из учётной записи"
          >
            <View style={styles.logoutIcon}>
              {logoutBusy ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Icon name="log-out-outline" size={24} color={colors.error} />
              )}
            </View>
            <View style={styles.logoutText}>
              <Text style={styles.logoutTitle}>Выйти из учётной записи</Text>
              <Text style={styles.logoutSubtitle}>
                Текущий сеанс будет завершён на этом устройстве
              </Text>
            </View>
            <Icon
              name="chevron-forward"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <View style={styles.dangerCard}>
            <View style={styles.dangerIcon}>
              <Icon name="trash-outline" size={24} color={colors.error} />
            </View>
            <View style={styles.dangerText}>
              <Text style={styles.dangerTitle}>Удаление профиля</Text>
              <Text style={styles.dangerSubtitle}>
                Профиль, сообщения, медиа, роли, сессии и исходное приглашение
                будут удалены без возможности восстановления.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteProfileButton}
              onPress={openAccountDeletion}
              accessibilityRole="button"
            >
              <Text style={styles.deleteProfileButtonText}>
                Удалить профиль
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={deletionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletionBusy) setDeletionVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.deletionDialog}>
            <View style={styles.deletionDialogIcon}>
              <Icon name="warning-outline" size={30} color={colors.error} />
            </View>
            <Text style={styles.deletionDialogTitle}>
              Удалить профиль навсегда?
            </Text>
            <Text style={styles.deletionDialogText}>
              Это действие необратимо. Для подтверждения решите пример и введите
              ответ:
            </Text>
            <Text style={styles.deletionEquation}>
              {deletionChallenge.left} + {deletionChallenge.right} = ?
            </Text>
            <TextInput
              style={styles.deletionInput}
              value={deletionAnswer}
              onChangeText={(value) => {
                setDeletionAnswer(value.replace(/[^0-9]/g, ""));
                setDeletionError(null);
              }}
              keyboardType="number-pad"
              maxLength={3}
              autoFocus
              editable={!deletionBusy}
              placeholder="Ответ"
              accessibilityLabel="Ответ на пример для удаления профиля"
            />
            {deletionError && (
              <Text style={styles.deletionError}>{deletionError}</Text>
            )}
            <View style={styles.deletionActions}>
              <TouchableOpacity
                style={styles.cancelDeletionButton}
                onPress={() => setDeletionVisible(false)}
                disabled={deletionBusy}
              >
                <Text style={styles.cancelDeletionText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmDeletionButton,
                  (!deletionAnswerIsCorrect || deletionBusy) && styles.disabled,
                ]}
                onPress={() => void permanentlyDeleteAccount()}
                disabled={!deletionAnswerIsCorrect || deletionBusy}
              >
                {deletionBusy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.confirmDeletionText}>
                    Удалить навсегда
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  cacheCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  cacheIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#EAF3FF",
  },
  cacheText: { flex: 1, minWidth: 0 },
  cacheTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cacheSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  cacheButton: { paddingVertical: 10, paddingHorizontal: 4 },
  cacheButtonText: { color: colors.error, fontSize: 12, fontWeight: "800" },
  roomsCard: {
    marginHorizontal: 18,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
  },
  sectionHeadingText: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  sectionSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  roomsError: {
    marginBottom: 12,
    color: colors.error,
    fontSize: 12,
    lineHeight: 17,
  },
  emptyRoomsText: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    color: colors.textSecondary,
    fontSize: 13,
  },
  roomRow: { flexDirection: "row", alignItems: "center", minHeight: 68 },
  roomRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  roomOpenTarget: {
    flex: 1,
    minWidth: 0,
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 8,
  },
  roomText: { flex: 1, minWidth: 0 },
  roomTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  roomSubtitle: { marginTop: 4, color: colors.textSecondary, fontSize: 11 },
  leaveRoomButton: {
    width: 44,
    height: 48,
    marginLeft: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  systemRoomMark: {
    width: 44,
    height: 48,
    marginLeft: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 18,
    marginTop: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3C8C4",
    borderRadius: 18,
    backgroundColor: "#FFF8F7",
  },
  logoutCard: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 18,
    marginTop: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  logoutIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FDECEA",
  },
  logoutText: { flex: 1, minWidth: 0 },
  logoutTitle: { color: colors.error, fontSize: 15, fontWeight: "800" },
  logoutSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  dangerIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FDECEA",
  },
  dangerText: { flex: 1, minWidth: 0 },
  dangerTitle: { color: colors.error, fontSize: 15, fontWeight: "800" },
  dangerSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  deleteProfileButton: {
    width: "100%",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  deleteProfileButtonText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(15, 27, 42, 0.55)",
  },
  deletionDialog: {
    width: "100%",
    maxWidth: 430,
    padding: 22,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  deletionDialogIcon: {
    width: 54,
    height: 54,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#FDECEA",
  },
  deletionDialogTitle: {
    marginTop: 14,
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  deletionDialogText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  deletionEquation: {
    marginTop: 18,
    color: colors.primary,
    fontSize: 25,
    fontWeight: "900",
    textAlign: "center",
  },
  deletionInput: {
    minHeight: 50,
    marginTop: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: colors.backgroundAlt,
  },
  deletionError: {
    marginTop: 10,
    color: colors.error,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  deletionActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelDeletionButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  cancelDeletionText: { color: colors.text, fontWeight: "800" },
  confirmDeletionButton: {
    flex: 1.35,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.error,
  },
  confirmDeletionText: { color: colors.white, fontSize: 13, fontWeight: "800" },
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
