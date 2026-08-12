import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../../components/Icon";
import { useMessengerAuth } from "../../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../../features/messenger/AuthenticatedAvatar";
import type {
  MessengerContact,
  MessengerRoomMember,
  MessengerRoomSettings,
} from "../../../features/messenger/types";
import {
  addMessengerPrivateRoomMember,
  deleteMessengerPrivateRoom,
  getMessengerContacts,
  getMessengerRoomMembers,
  getMessengerRoomSettings,
  messengerErrorMessage,
  removeMessengerPrivateRoomMember,
  removeMessengerRoomAvatar,
  updateMessengerRoomProfile,
  uploadMessengerRoomAvatar,
} from "../../../services/messengerApi";
import {
  pickMessengerAvatar,
  type MessengerUploadFile,
} from "../../../services/messengerAttachmentPicker";
import { colors } from "../../../styles/commonStyles";

function contactKey(contact: MessengerContact): string {
  return `${contact.team_id}:${contact.id}`;
}

type GroupParticipant = MessengerRoomMember & { is_admin: boolean };

export default function MessengerGroupSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    roomType?: string;
    teamId?: string;
    avatarUrl?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.id;
  const [settings, setSettings] = useState<MessengerRoomSettings | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [contacts, setContacts] = useState<MessengerContact[]>([]);
  const [title, setTitle] = useState(params.title || "");
  const [selectedAvatar, setSelectedAvatar] =
    useState<MessengerUploadFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !roomId) return;
    setError(null);
    try {
      const [next, roomMembers] = await Promise.all([
        getMessengerRoomSettings(roomId),
        getMessengerRoomMembers(roomId),
      ]);
      const privateMembers = new Map(
        next.members.map((member) => [member.id, member]),
      );
      setSettings(next);
      setParticipants(
        roomMembers.map((member) => ({
          ...member,
          is_admin: privateMembers.get(member.id)?.is_admin ?? false,
        })),
      );
      setTitle(next.room.title);
      setSelectedAvatar(null);
      if (next.can_manage_members) {
        setContacts(await getMessengerContacts(next.room.team_id));
      } else {
        setContacts([]);
      }
    } catch (loadError) {
      setError(
        messengerErrorMessage(
          loadError,
          "Не удалось загрузить настройки группы",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, roomId]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        router.replace("/messenger/register");
        return;
      }
      void load();
    }, [isAuthenticated, load, router]),
  );

  const memberIds = useMemo(
    () => new Set(participants.map((member) => member.id)),
    [participants],
  );
  const availableContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.team_id === settings?.room.team_id &&
          !memberIds.has(contact.id),
      ),
    [contacts, memberIds, settings?.room.team_id],
  );

  const chooseAvatar = async () => {
    if (!settings?.can_manage_profile || saving) return;
    try {
      const file = await pickMessengerAvatar();
      if (file) {
        setSelectedAvatar(file);
        setError(null);
      }
    } catch (pickerError) {
      Alert.alert(
        "Не удалось выбрать фотографию",
        messengerErrorMessage(pickerError, "Проверьте разрешение на медиатеку"),
      );
    }
  };

  const save = async () => {
    if (!settings?.can_manage_profile || saving) return;
    const nextTitle = title.trim();
    if (nextTitle.length < 2) {
      setError("Название должно содержать не менее двух символов.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (nextTitle !== settings.room.title) {
        await updateMessengerRoomProfile(roomId, nextTitle);
      }
      if (selectedAvatar) {
        await uploadMessengerRoomAvatar(roomId, {
          uri: selectedAvatar.uri,
          name: selectedAvatar.name,
          type: selectedAvatar.type,
        });
      }
      const next = await getMessengerRoomSettings(roomId);
      setSettings(next);
      setTitle(next.room.title);
      setSelectedAvatar(null);
      router.back();
    } catch (saveError) {
      setError(messengerErrorMessage(saveError, "Не удалось сохранить группу"));
    } finally {
      setSaving(false);
    }
  };

  const removeAvatar = () => {
    if (selectedAvatar) {
      setSelectedAvatar(null);
      return;
    }
    if (!settings?.can_manage_profile || !settings.room.avatar_url || saving)
      return;
    Alert.alert(
      "Удалить аватар группы?",
      "Вместо него будут показаны инициалы.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            setSaving(true);
            setError(null);
            void removeMessengerRoomAvatar(roomId)
              .then(() => getMessengerRoomSettings(roomId))
              .then(setSettings)
              .catch((removeError) =>
                setError(
                  messengerErrorMessage(
                    removeError,
                    "Не удалось удалить аватар",
                  ),
                ),
              )
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  const addMember = async (contact: MessengerContact) => {
    if (memberBusy) return;
    setMemberBusy(contact.id);
    setError(null);
    try {
      await addMessengerPrivateRoomMember(roomId, contact.id);
      await load();
      setAddVisible(false);
    } catch (addError) {
      setError(
        messengerErrorMessage(addError, "Не удалось добавить участника"),
      );
    } finally {
      setMemberBusy(null);
    }
  };

  const removeMember = (member: GroupParticipant) => {
    if (member.is_admin || memberBusy) return;
    Alert.alert(
      "Исключить участника?",
      `${member.display_name} больше не будет видеть эту группу.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Исключить",
          style: "destructive",
          onPress: () => {
            setMemberBusy(member.id);
            setError(null);
            void removeMessengerPrivateRoomMember(roomId, member.id)
              .then(() => load())
              .catch((removeError) =>
                setError(
                  messengerErrorMessage(
                    removeError,
                    "Не удалось исключить участника",
                  ),
                ),
              )
              .finally(() => setMemberBusy(null));
          },
        },
      ],
    );
  };

  const deleteGroup = () => {
    if (!settings?.can_manage_members || saving) return;
    Alert.alert(
      "Удалить мини-группу?",
      "Группа исчезнет у всех участников. Это действие нельзя отменить.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            setSaving(true);
            setError(null);
            void deleteMessengerPrivateRoom(roomId)
              .then(() => router.replace("/messenger/rooms"))
              .catch((deleteError) => {
                setError(
                  messengerErrorMessage(
                    deleteError,
                    "Не удалось удалить группу",
                  ),
                );
                setSaving(false);
              });
          },
        },
      ],
    );
  };

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
          >
            <Icon name="chevron-back" size={28} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>
              {settings?.can_manage_profile ? "Управление группой" : "О группе"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {settings?.can_manage_profile
                ? "Изменения увидят все участники"
                : "Информация и участники группы"}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !settings ? (
          <View style={styles.center}>
            <Icon
              name="alert-circle-outline"
              size={46}
              color={colors.warning}
            />
            <Text style={styles.centerText}>
              {error || "Настройки недоступны"}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void load()}
            >
              <Text style={styles.retryText}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <View style={styles.avatarWrap}>
                {selectedAvatar ? (
                  <Image
                    source={{ uri: selectedAvatar.uri }}
                    style={styles.avatarPreview}
                    contentFit="cover"
                  />
                ) : (
                  <AuthenticatedAvatar
                    displayName={settings.room.title}
                    avatarUrl={settings.room.avatar_url}
                    accessToken={session.access_token}
                    size={108}
                  />
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  !settings.can_manage_profile && styles.disabled,
                ]}
                onPress={chooseAvatar}
                disabled={!settings.can_manage_profile || saving}
              >
                <Icon
                  name="camera"
                  size={20}
                  color={
                    settings.can_manage_profile
                      ? colors.primary
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.secondaryButtonText,
                    !settings.can_manage_profile && styles.readOnlyControlText,
                  ]}
                >
                  Выбрать аватар
                </Text>
              </TouchableOpacity>
              {settings.can_manage_profile &&
                (selectedAvatar || settings.room.avatar_url) && (
                  <TouchableOpacity onPress={removeAvatar} disabled={saving}>
                    <Text style={styles.removeAvatarText}>
                      {selectedAvatar ? "Отменить выбор" : "Удалить аватар"}
                    </Text>
                  </TouchableOpacity>
                )}

              <Text style={styles.label}>Название группы</Text>
              <TextInput
                style={[
                  styles.input,
                  !settings.can_manage_profile && styles.readOnlyInput,
                ]}
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                placeholder="Название группы"
                editable={settings.can_manage_profile && !saving}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {settings.can_manage_profile ? (
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (saving || title.trim().length < 2) && styles.disabled,
                  ]}
                  onPress={() => void save()}
                  disabled={saving || title.trim().length < 2}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Сохранить изменения
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <Text style={styles.readOnlyHint}>
                  Изменение названия и аватара вам недоступно.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Участники</Text>
                  <Text style={styles.sectionSubtitle}>
                    {participants.length} в группе
                  </Text>
                </View>
                {settings.can_manage_members ? (
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setAddVisible(true)}
                  >
                    <Icon name="person-add" size={19} color={colors.primary} />
                    <Text style={styles.addButtonText}>Добавить</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {participants.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <AuthenticatedAvatar
                    displayName={member.display_name}
                    avatarUrl={member.avatar_url}
                    accessToken={session.access_token}
                    size={44}
                  />
                  <View style={styles.memberText}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.display_name}
                    </Text>
                    <Text style={styles.memberRole}>
                      {member.is_admin
                        ? "Администратор · создатель"
                        : member.id === session.user.id
                          ? "Участник · Вы"
                          : "Участник"}
                    </Text>
                  </View>
                  {settings.can_manage_members && !member.is_admin ? (
                    memberBusy === member.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <TouchableOpacity
                        style={styles.removeMemberButton}
                        onPress={() => removeMember(member)}
                        accessibilityLabel={`Исключить ${member.display_name}`}
                      >
                        <Icon
                          name="remove-circle-outline"
                          size={23}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    )
                  ) : member.is_admin ? (
                    <Icon
                      name="shield-checkmark"
                      size={22}
                      color={colors.primary}
                    />
                  ) : null}
                </View>
              ))}
            </View>

            {settings.can_manage_members ? (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={deleteGroup}
                disabled={saving}
              >
                <Icon name="trash-outline" size={20} color={colors.error} />
                <Text style={styles.deleteText}>Удалить мини-группу</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={addVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddVisible(false)}>
          <Pressable
            style={styles.sheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Добавить участника</Text>
                <Text style={styles.sheetSubtitle}>
                  Доступные контакты команды
                </Text>
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setAddVisible(false)}
              >
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableContacts}
              keyExtractor={contactKey}
              style={styles.contactList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => void addMember(item)}
                  disabled={Boolean(memberBusy)}
                >
                  <AuthenticatedAvatar
                    displayName={item.display_name}
                    avatarUrl={item.avatar_url}
                    accessToken={session.access_token}
                    size={46}
                  />
                  <View style={styles.memberText}>
                    <Text style={styles.memberName}>{item.display_name}</Text>
                    <Text style={styles.memberRole}>{item.team_name}</Text>
                  </View>
                  {memberBusy === item.id ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Icon name="add-circle" size={25} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContacts}>
                  <Text style={styles.centerText}>
                    Все доступные контакты уже в группе.
                  </Text>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 8 },
  headerTitle: { color: colors.text, fontSize: 21, fontWeight: "800" },
  headerSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  centerText: {
    marginTop: 10,
    color: colors.textSecondary,
    textAlign: "center",
  },
  retryButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: colors.primary, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  avatarWrap: { alignItems: "center", marginBottom: 12 },
  avatarPreview: { width: 108, height: 108, borderRadius: 54 },
  secondaryButton: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: "#EAF3FF",
  },
  secondaryButtonText: { color: colors.primary, fontWeight: "800" },
  removeAvatarText: {
    marginTop: 10,
    marginBottom: 16,
    color: colors.error,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  label: {
    marginTop: 18,
    marginBottom: 7,
    color: colors.text,
    fontWeight: "800",
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
  readOnlyInput: {
    color: colors.textSecondary,
    backgroundColor: "#F2F4F7",
  },
  readOnlyControlText: { color: colors.textSecondary },
  readOnlyHint: {
    marginTop: 12,
    color: colors.textSecondary,
    textAlign: "center",
    fontSize: 12,
  },
  errorText: { marginTop: 9, color: colors.error, fontSize: 12 },
  saveButton: {
    minHeight: 49,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  saveButtonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.45 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  sectionSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  addButtonText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  memberRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  memberRole: { marginTop: 3, color: colors.textSecondary, fontSize: 11 },
  removeMemberButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.35)",
    borderRadius: 15,
  },
  deleteText: { color: colors.error, fontWeight: "800" },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(16, 40, 68, 0.38)",
  },
  sheet: {
    maxHeight: "78%",
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sheetSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  contactList: { flexGrow: 0 },
  contactRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  emptyContacts: {
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
  },
});
