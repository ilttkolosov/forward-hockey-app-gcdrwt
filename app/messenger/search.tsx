import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
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
import type {
  MessengerMessage,
  MessengerRoom,
} from "../../features/messenger/types";
import {
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "../../features/messenger/repository";
import {
  getMessengerRooms,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { searchMessengerMessagesLocallyFirst } from "../../services/messengerSearch";
import { stripMessengerTextFormatting } from "../../services/messengerTextFormatting";
import { colors } from "../../styles/commonStyles";
import {
  reportAnalyticsError,
  trackMessengerAction,
} from "../../services/analyticsService";

type DateField = "from" | "to";

function dayBoundary(date: Date, end: boolean): string {
  const result = new Date(date);
  result.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return result.toISOString();
}

function formatDay(date: Date | null): string {
  return date
    ? date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Не выбрана";
}

function messagePreview(message: MessengerMessage): string {
  if (message.kind === "image") return message.text || "Фото";
  if (message.kind === "video") return message.text || "Видео";
  if (message.kind === "file")
    return message.text || message.media?.original_name || "Файл";
  if (message.kind === "location") return message.text || "Геопозиция";
  return stripMessengerTextFormatting(message.text) || "Сообщение";
}

function searchResultBucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 10) return "1_10";
  if (count <= 50) return "11_50";
  return "51_plus";
}

export default function MessengerSearchScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{
    roomId?: string;
    roomTitle?: string;
    initialQuery?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const scopedRoomId = params.roomId || undefined;
  const [query, setQuery] = useState(params.initialQuery || "");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [dateField, setDateField] = useState<DateField | null>(null);
  const [rooms, setRooms] = useState<MessengerRoom[]>([]);
  const [results, setResults] = useState<MessengerMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/messenger/register");
      return;
    }
    let active = true;
    void (async () => {
      let cached: MessengerRoom[] = [];
      try {
        cached = await loadCachedMessengerRooms(db);
        if (active && cached.length) setRooms(cached);
      } catch {
        // A remote room refresh below can still repair an empty/new database.
      }
      try {
        const remote = await getMessengerRooms({ priority: "background" });
        const reconciled = await cacheMessengerRooms(db, remote).catch(
          () => remote,
        );
        if (active) setRooms(reconciled);
      } catch (loadError) {
        if (active && !cached.length) {
          setError(messengerErrorMessage(loadError));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [db, isAuthenticated, router]);

  const roomById = useMemo(
    () => new Map(rooms.map((room) => [room.id, room] as const)),
    [rooms],
  );
  const hasFilters = Boolean(query.trim() || dateFrom || dateTo);

  const executeSearch = useCallback(
    async (cursor?: string) => {
      if (!hasFilters || (cursor && loadingMore) || (!cursor && loading))
        return;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      if (!cursor) {
        Keyboard.dismiss();
        setError(null);
      }
      try {
        const response = await searchMessengerMessagesLocallyFirst(db, {
          query,
          roomId: scopedRoomId,
          dateFrom: dateFrom ? dayBoundary(dateFrom, false) : undefined,
          dateTo: dateTo ? dayBoundary(dateTo, true) : undefined,
          cursor,
          limit: 50,
        });
        setResults((current) =>
          cursor ? [...current, ...response.items] : response.items,
        );
        setNextCursor(response.page.next_cursor);
        setSearched(true);
        if (!cursor) {
          trackMessengerAction("search_completed", {
            scope: scopedRoomId ? "chat" : "global",
            filter_type: query.trim()
              ? dateFrom || dateTo
                ? "text_and_date"
                : "text"
              : "date",
            source: response.source,
            result: "success",
            result_bucket: searchResultBucket(response.items.length),
          });
        }
      } catch (searchError) {
        setError(
          messengerErrorMessage(searchError, "Не удалось выполнить поиск"),
        );
        if (!cursor) {
          reportAnalyticsError("messenger_search_failed", searchError);
          trackMessengerAction("search_completed", {
            scope: scopedRoomId ? "chat" : "global",
            filter_type: query.trim()
              ? dateFrom || dateTo
                ? "text_and_date"
                : "text"
              : "date",
            result: "failed",
          });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [db, dateFrom, dateTo, hasFilters, loading, loadingMore, query, scopedRoomId],
  );

  const openResult = useCallback(
    (message: MessengerMessage) => {
      const room = roomById.get(message.room_id);
      if (!room) return;
      trackMessengerAction("search_result_opened", {
        scope: scopedRoomId ? "chat" : "global",
        content_type: message.kind,
        room_type: room.room_type,
      });
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
          peerNotificationsMuted: String(Boolean(room.peer?.notifications_muted)),
          pushMessageId: message.id,
          pushSequence: message.sequence,
        },
      });
    },
    [roomById, router, scopedRoomId],
  );

  const handleDateChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setDateField(null);
    if (event.type === "dismissed" || !value || !dateField) return;
    if (dateField === "from") setDateFrom(value);
    else setDateTo(value);
  };

  const selectedDate = dateField === "to" ? dateTo : dateFrom;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
        >
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Поиск сообщений</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {scopedRoomId
              ? params.roomTitle || "В этом чате"
              : "Во всех диалогах"}
          </Text>
        </View>
      </View>

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Icon name="search" size={20} color="#758596" />
          <TextInput
            autoFocus
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Слово или фраза"
            placeholderTextColor="#8A969C"
            returnKeyType="search"
            onSubmitEditing={() => void executeSearch()}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Icon name="close-circle" size={21} color="#91A0AF" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.dateRow}>
          {(["from", "to"] as const).map((field) => {
            const date = field === "from" ? dateFrom : dateTo;
            return (
              <TouchableOpacity
                key={field}
                style={[styles.dateButton, date && styles.dateButtonActive]}
                onPress={() => setDateField(field)}
              >
                <Icon
                  name="calendar-outline"
                  size={17}
                  color={colors.primary}
                />
                <View style={styles.dateTextWrap}>
                  <Text style={styles.dateLabel}>
                    {field === "from" ? "С даты" : "По дату"}
                  </Text>
                  <Text style={styles.dateValue}>{formatDay(date)}</Text>
                </View>
                {date && (
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() =>
                      field === "from" ? setDateFrom(null) : setDateTo(null)
                    }
                  >
                    <Icon name="close" size={17} color="#758596" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {dateField && (
          <View style={styles.datePickerWrap}>
            <DateTimePicker
              value={selectedDate || new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
            {Platform.OS === "ios" && (
              <TouchableOpacity
                style={styles.dateDone}
                onPress={() => setDateField(null)}
              >
                <Text style={styles.dateDoneText}>Готово</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.searchButton,
            (!hasFilters || loading) && styles.disabled,
          ]}
          disabled={!hasFilters || loading}
          onPress={() => void executeSearch()}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.searchButtonText}>Найти</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          results.length ? styles.results : styles.emptyResults
        }
        onEndReached={() => {
          if (nextCursor) void executeSearch(nextCursor);
        }}
        onEndReachedThreshold={0.35}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Icon name="search-outline" size={42} color="#A7B3BF" />
              <Text style={styles.emptyTitle}>
                {searched
                  ? "Ничего не найдено"
                  : "Введите запрос или выберите дату"}
              </Text>
              <Text style={styles.emptyText}>
                {searched
                  ? "Попробуйте изменить слово или диапазон дат."
                  : "Результаты откроются списком; нажатие перенесёт к сообщению."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
        renderItem={({ item }) => {
          const room = roomById.get(item.room_id);
          return (
            <TouchableOpacity
              style={styles.resultCard}
              disabled={!room}
              onPress={() => openResult(item)}
            >
              <AuthenticatedAvatar
                displayName={item.author.display_name}
                avatarUrl={item.author.avatar_url}
                accessToken={session?.access_token || ""}
                size={42}
              />
              <View style={styles.resultBody}>
                <View style={styles.resultMeta}>
                  <Text style={styles.author} numberOfLines={1}>
                    {item.author.display_name}
                  </Text>
                  <Text style={styles.time}>
                    {new Date(item.created_at).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                {!scopedRoomId && (
                  <Text style={styles.roomName}>{room?.title || "Чат"}</Text>
                )}
                <Text style={styles.preview} numberOfLines={3}>
                  {messagePreview(item)}
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color="#A0ADBA" />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F4F7FA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DCE4EB",
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 4 },
  title: { fontSize: 20, fontWeight: "700", color: "#1F3347" },
  subtitle: { marginTop: 2, color: "#758596", fontSize: 13 },
  searchCard: {
    backgroundColor: "#FFFFFF",
    margin: 12,
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  searchRow: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#F0F4F7",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  input: { flex: 1, color: "#1F3347", fontSize: 16, paddingVertical: 10 },
  dateRow: { flexDirection: "row", gap: 8 },
  dateButton: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#DCE4EB",
    borderRadius: 11,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dateButtonActive: { borderColor: colors.primary, backgroundColor: "#F3F8FF" },
  dateTextWrap: { flex: 1 },
  dateLabel: { color: "#758596", fontSize: 11 },
  dateValue: {
    color: "#1F3347",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  datePickerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DCE4EB",
    paddingTop: 8,
  },
  dateDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  dateDoneText: { color: colors.primary, fontWeight: "700" },
  searchButton: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  searchButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.48 },
  error: { color: colors.error, marginHorizontal: 18, marginBottom: 8 },
  results: { paddingHorizontal: 12, paddingBottom: 28, gap: 8 },
  emptyResults: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 34,
  },
  emptyTitle: {
    color: "#40566B",
    fontWeight: "700",
    fontSize: 17,
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    color: "#7A8997",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    textAlign: "center",
  },
  resultCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultBody: { flex: 1 },
  resultMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  author: { flex: 1, color: "#1F3347", fontWeight: "700", fontSize: 14 },
  time: { color: "#8795A3", fontSize: 11 },
  roomName: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  preview: { color: "#40566B", fontSize: 14, lineHeight: 19, marginTop: 4 },
  footer: { paddingVertical: 18 },
});
